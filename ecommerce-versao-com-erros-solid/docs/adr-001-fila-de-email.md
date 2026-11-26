# ADR 001: fila de e-mail com lista do Redis

- **Status:** Aceita
- **Data:** 2026-11-25
- **Projeto:** 4 (continua a arquitetura dos Projetos 1, 2 e 3)

## Contexto

Até o Projeto 3, o envio do e-mail de confirmação acontecia **dentro da requisição** `POST /orders`. O fluxo do `OrderService.execute` era: validar o carrinho, calcular o total, cobrar, gravar o pedido, **enviar o e-mail** e só então responder.

Isso criou dois problemas:

1. **Latência atrelada a um serviço externo.** O tempo de resposta incluía a ida e volta ao servidor SMTP (e, na primeira requisição, a criação da conta de teste do Ethereal). O cliente esperava por uma tarefa que não é necessária para saber se o pedido foi aceito.
2. **Uma falha no e-mail derrubava o pedido.** Quando o envio falhava, o erro subia até o controller e o cliente recebia **500**, mas o pedido **já estava cobrado e gravado**. A reação natural de quem recebe um erro é tentar de novo, o que duplica o pedido e a cobrança.

As forças que pesaram na decisão:

- **Confiabilidade:** uma tarefa secundária (notificação) não pode invalidar a tarefa principal (pedido).
- **Tempo de resposta:** a API deve responder assim que o pedido estiver gravado.
- **Simplicidade operacional:** o projeto já roda em Docker Compose, e a solução não deve exigir muita infraestrutura nova.
- **Evolução:** deve ser possível aumentar a capacidade de envio sem mexer na API.

## Decisão

Separar quem **recebe** o pedido de quem **envia** o e-mail, usando uma **fila**:

- A **API** grava o pedido e **publica uma mensagem** (o pedido serializado em JSON) em uma **lista do Redis** com o comando `LPUSH`. Em seguida, responde, sem esperar o e-mail.
- Um **worker**, em **outro container** (mesmo `Dockerfile`, comando `npm run worker`), lê a lista com `BRPOP` e, para cada mensagem, chama o `NotificationService`, que envia o e-mail.
- O `OrderService` conhece só a interface `IOrderQueue`. A `RedisOrderQueue` é a única classe da API que fala com o Redis e é registrada no `container.ts`. Nenhum arquivo de `services/` ou `controllers/` importa o Redis.

### Por que uma lista (`LPUSH` / `BRPOP`) e não publish/subscribe

| | Lista (`LPUSH` / `BRPOP`) | Publish/subscribe |
|---|---|---|
| Ninguém está escutando (worker parado) | A mensagem **espera** na lista | A mensagem **se perde** |
| Dois workers ativos | Cada mensagem vai para **um só** (o `BRPOP` remove o item de forma atômica) | **Todos** recebem: o e-mail sairia duas vezes |
| Guarda as mensagens | Sim, até alguém retirá-las | Não (entrega imediata e esquecimento) |
| Modelo | Fila de trabalho: **divide** o trabalho entre consumidores | Difusão: **repete** o evento para todos os interessados |

O e-mail de confirmação é um **trabalho a ser feito uma vez**, e não um evento que todos precisam ouvir. A lista atende exatamente a isso. O pub/sub falharia nos dois cenários que o projeto exige: com o worker parado os pedidos seriam perdidos, e com dois workers cada e-mail sairia em duplicidade.

Com `LPUSH` (entra pela esquerda) e `BRPOP` (sai pela direita), a lista é uma fila **FIFO**: o pedido mais antigo é atendido primeiro. O `B` de *blocking* faz o worker dormir até chegar um item, sem ficar perguntando a cada instante (*polling*).

### Detalhes da decisão

- **A mensagem** leva só os dados que o e-mail precisa (`id`, `customer`, `items` e `total`). O campo `items` continua como texto JSON, igual ao que é gravado no banco, e o worker reconstrói os produtos com a `ProductFactory`. O `createdAt` fica de fora, porque um `Date` viraria texto ao passar por JSON.
- **O nome da lista** (`orders:email`) fica em uma constante única, usada pela API e pelo worker, para que um erro de digitação não faça o worker esperar uma lista que ninguém alimenta.
- **O Redis** roda com persistência AOF e um volume, e **não publica porta**.
- **Falha ao publicar:** se a publicação na fila falhar depois de o pedido estar gravado, a API **registra o erro no log e responde normalmente**. O princípio é que o pedido confirmado não pode ser invalidado por uma tarefa secundária.
- **Falha no worker:** o `try/catch` fica dentro do laço, então uma mensagem estragada ou uma falha de e-mail não derruba o worker. A mensagem que falhou é registrada no log.
- **Encerramento:** ao receber `SIGTERM`, o worker termina o pedido em andamento antes de sair.
- **A resposta do `POST /orders` deixou de ter o `emailPreview`.** O link de visualização do Ethereal passa a aparecer no log do worker.

### Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| Continuar enviando na requisição (Projeto 3) | É justamente o problema descrito no contexto |
| Disparar o envio dentro da própria API sem esperar (*fire-and-forget*) | Não resolve: se o processo da API cair ou reiniciar, o e-mail se perde, e não há como escalar o envio separadamente |
| Redis Streams com grupos de consumidores | Resolve a perda de mensagens com confirmação e reenvio, mas é bem mais complexo para o tamanho do problema |
| RabbitMQ, SQS ou uma biblioteca de filas (como BullMQ) | Trazem reenvio, atraso e prioridades prontos, mas acrescentam uma tecnologia ou dependência maior do que o problema pede |
| Gravar o recado no próprio banco, na mesma transação do pedido (padrão *outbox*) | É a solução mais robusta para o caso de falha ao publicar, e foi deixada como melhoria futura |

## Consequências

### Positivas

- **A API responde sem esperar o e-mail.** O tempo de resposta deixa de depender do servidor SMTP.
- **Uma falha no e-mail não derruba mais o pedido.** O pedido pago e gravado é confirmado, independentemente do que aconteça no envio.
- **Os pedidos esperam com o worker parado.** As mensagens ficam na lista (dá para medir com `LLEN`) e são enviadas quando o worker volta.
- **A capacidade de envio escala sem mexer na API.** Basta aumentar o número de workers (`docker compose up -d --scale worker=2`). Como o `BRPOP` é atômico, cada pedido é enviado uma vez só.
- **A arquitetura em camadas se manteve.** A fila é uma abstração (`IOrderQueue`) registrada no container, como o banco e o e-mail.

### Negativas e riscos

- **Dois serviços a mais para operar** (`redis` e `worker`), com seus próprios logs e pontos de falha.
- **Entrega "no máximo uma vez".** O `BRPOP` **retira** a mensagem da lista **antes** de o e-mail ser enviado. Se o worker cair (ou o envio falhar) depois disso, aquele e-mail se perde: não há reenvio automático nem fila de mensagens com falha. O worker registra no log a mensagem que falhou, o que permite o reenvio manual.
- **Falha silenciosa ao publicar.** Como a API responde mesmo quando não consegue enfileirar, o cliente não é avisado de que o e-mail não vai sair. Só o log da API (que cita o número do pedido) registra o problema.
- **Consistência eventual.** O pedido existe antes de o e-mail ser enviado, e o cliente pode consultá-lo (`GET /orders/:id`) sem ter recebido a confirmação.
- **Mudança de contrato da API.** A resposta do `POST /orders` perdeu o campo `emailPreview`. Quem dependia dele precisa ler o log do worker.
- **O Redis é um ponto único de falha da notificação.** Com a persistência AOF e o volume, a fila sobrevive a um restart do Redis, mas o AOF grava a cada segundo, então uma queda brusca pode perder as últimas mensagens. Um `docker compose down -v` apaga o volume e a fila junto.
- **Se o Redis estiver fora do ar,** o cliente reconecta em segundo plano e a publicação pode ficar pendente até ele voltar. O pedido é gravado antes, então não é perdido, mas a resposta pode demorar.

### Melhorias possíveis

- Usar `BLMOVE` (uma lista de "em processamento") ou Redis Streams para entregar "pelo menos uma vez", com reenvio das mensagens que falharam.
- Limitar as tentativas e mandar as mensagens que falham repetidamente para uma fila de mensagens mortas.
- Aplicar o padrão *outbox* para eliminar a falha silenciosa ao publicar.
- Tornar o envio idempotente (por exemplo, registrando o `id` do pedido já notificado), o que permitiria reenviar sem risco de duplicar.

### Como verificar

```bash
# Worker parado: os pedidos esperam na fila
docker compose stop worker
# (faça alguns POST /orders)
docker compose exec redis redis-cli LLEN orders:email
docker compose start worker
docker compose logs -f worker

# Dois workers: cada pedido é enviado uma vez só
docker compose up -d --scale worker=2
docker compose logs worker | grep -o "pedido #[0-9]*" | sort | uniq -d    # não deve imprimir nada
```