# E-commerce SOLID: do código legado ao container Docker

Backend de e-commerce em TypeScript usado em quatro trabalhos encadeados da disciplina de Arquitetura de Software. Cada trabalho continua o anterior, por isso os quatro vivem neste mesmo repositório, e a explicação de cada um está em uma seção deste README.

| | Projeto 1 | Projeto 2 | Projeto 3 | Projeto 4 |
|---|---|---|---|---|
| **Tema** | Refatoração aplicando SOLID | Inversão de Controle com InversifyJS | Containers com Docker Compose e PostgreSQL | Fila de mensagens com Redis e worker |
| **Ponto de partida** | Um `OrderController` "God Class" com toda a lógica | O resultado do Projeto 1, com montagem manual (`new`) | O resultado do Projeto 2, rodando direto na máquina com SQLite | O resultado do Projeto 3, em que o e-mail é enviado dentro da requisição |
| **Resultado** | Responsabilidades separadas em camadas, ligadas por interfaces | Montagem automática por container, com os modos `dev` e `test` | API e banco em containers, PostgreSQL no lugar do SQLite e a rota `GET /orders/:id` | A API publica o pedido numa fila do Redis e um worker, em outro container, envia o e-mail |

## Sumário

1. [Visão geral e tecnologias](#visão-geral-e-tecnologias)
2. [Como rodar](#como-rodar)
3. [Projeto 1: refatoração SOLID](#projeto-1-refatoração-solid)
4. [Projeto 2: container IoC com InversifyJS](#projeto-2-container-ioc-com-inversifyjs)
5. [Projeto 3: Docker Compose, PostgreSQL e GET /orders/:id](#projeto-3-docker-compose-postgresql-e-get-ordersid)
6. [Projeto 4: fila no Redis, worker e ADR](#projeto-4-fila-no-redis-worker-e-adr)
7. [Conceitos aplicados](#conceitos-aplicados)
8. [Limitações e melhorias futuras](#limitações-e-melhorias-futuras)

---

## Visão geral e tecnologias

A API recebe pedidos em `POST /orders` (valida o carrinho, calcula total e frete, processa o pagamento, grava o pedido e o publica numa fila) e permite consultá-los em `GET /orders/:id`. Um **worker**, em outro container, lê a fila e envia o e-mail de confirmação.

| Camada | Tecnologia |
|---|---|
| Linguagem e execução | TypeScript, Node.js 22, `tsx` |
| HTTP | Express |
| Banco de dados | PostgreSQL 16 com Prisma (SQLite nos Projetos 1 e 2) |
| Logs | Winston |
| E-mail | Nodemailer com Ethereal (caixa de e-mail de teste) |
| Injeção de dependência | InversifyJS 7 e `reflect-metadata` |
| Variáveis de ambiente | `dotenv` |
| Fila de mensagens | Redis 7 (lista com `LPUSH` / `BRPOP`) e o pacote `redis` |
| Containers | Docker e Docker Compose |

---

## Como rodar

Esta seção descreve o estado final do projeto (depois do Projeto 3). Todos os comandos são executados **dentro da pasta do projeto**.

### Pré-requisitos

- Git
- Docker com o plugin Compose (confira com `docker --version` e `docker compose version`)

Não é necessário ter Node.js instalado para rodar a aplicação, porque ele já está dentro da imagem da API. O Node só é preciso se você quiser rodar `npx tsc --noEmit` na sua máquina.

### 1. Clonar e preparar

```bash
git clone <url-do-repositório>
cd <pasta-do-repositório>/ecommerce-versao-com-erros-solid   # se você já estiver nesta pasta, pule este passo
cp .env.example .env
```

### 2. Subir tudo

```bash
docker compose up --build
```

O `--build` reconstrói a imagem da API. Use-o sempre que mudar o código, senão o container roda a versão antiga.

O que acontece, na ordem:

1. Os serviços `banco` (PostgreSQL) e `redis` iniciam e ficam `healthy`.
2. A `api` e o `worker` só iniciam depois disso (a `api` espera o banco e o Redis, e o `worker` espera o Redis).
3. A `api` executa `npm start`: cria as tabelas (`prisma db push`), cadastra os produtos (seed) e sobe o servidor em `http://localhost:3000`.
4. O `worker` executa `npm run worker`: conecta ao Redis e fica esperando pedidos na fila.

### 3. Escolher o modo de execução

Os modos são definidos **só** pela variável `APP_ENV` no arquivo `.env`. Nenhum código precisa mudar para alternar entre eles.

| | `APP_ENV=dev` | `APP_ENV=test` |
|---|---|---|
| **E-mail** | `EtherealMailProvider`: envia para o Ethereal e devolve um link de visualização | `ConsoleMailProvider`: imprime o e-mail no console do servidor |
| **Pedidos** | `PrismaOrderRepository`: gravados no PostgreSQL | `InMemoryOrderRepository`: guardados em um array na memória (somem ao reiniciar a API) |
| **Internet** | Necessária para o e-mail (Ethereal) | Não necessária |
| **Onde o e-mail aparece** | No **log do worker**, com o link de visualização do Ethereal | No **log do worker**, impresso pelo `ConsoleMailProvider` |


> O catálogo de **produtos** vem do PostgreSQL nos dois modos. Por isso o serviço `banco` é necessário mesmo em `test`.

Para trocar de modo, edite o `.env` e **recrie a API e o worker** (reiniciar não relê o arquivo):

```bash
# exemplo: APP_ENV=test no .env, e depois
docker compose up -d --force-recreate api worker
```

### 4. Testar

Criar um pedido:

```bash
curl -X POST http://localhost:3000/orders \
-H "Content-Type: application/json" \
-d '{
  "customer": "cliente@ethereal.email",
  "items": [{ "productId": 1, "quantity": 1 }],
  "paymentMethod": "pix"
}'
```

Resposta de sucesso:

```json
{
  "message": "Pedido processado com sucesso",
  "orderId": 1
}
```

> O e-mail é enviado **depois**, pelo worker, então a resposta não traz mais o `emailPreview`. Para ver o e-mail (e o link do Ethereal), leia o log do worker: `docker compose logs -f worker`.

Consultar o pedido criado:

```bash
curl -i http://localhost:3000/orders/1
```

```json
{
  "id": 1,
  "customer": "cliente@ethereal.email",
  "items": "[{\"id\":1,\"name\":\"O Programador Pragmático (Livro Físico)\",\"type\":\"physical\",\"price\":100,\"quantity\":1}]",
  "total": 110,
  "status": "confirmed",
  "createdAt": "2026-11-21T02:56:41.496Z"
}
```

> O campo `items` volta como **texto JSON**, do mesmo jeito que é gravado no banco (veja as decisões de design do Projeto 3).

Os produtos cadastrados pelo seed:

| ID | Produto | Tipo | Preço | Frete |
|---|---|---|---|---|
| 1 | O Programador Pragmático | Livro físico | R$ 100 | R$ 10 por linha do carrinho |
| 2 | Clean Code | E-book | R$ 50 | Sem frete |

Formas de pagamento aceitas em `paymentMethod`: `credit_card`, `debit_card` e `pix`. O Pix não precisa de `paymentDetails`.

Respostas de erro (sempre no formato `{"error": "..."}`):

| Situação | Status | Mensagem |
|---|---|---|
| Carrinho vazio | 400 | `Carrinho vazio` |
| Produto inexistente | 400 | `Produto 999 não encontrado` |
| Forma de pagamento desconhecida | 400 | `Método de pagamento não suportado` |
| `GET` com id que não é inteiro positivo (`abc`, `1.5`, `0`) | 400 | `Id inválido` |
| `GET` de pedido que não existe | 404 | `Pedido não encontrado` |
| Cartão de crédito com CVV `000` | 500 | `Erro interno` |

### 5. Comandos úteis

| Objetivo | Comando |
|---|---|
| Ver o estado dos containers | `docker compose ps` |
| Ler os logs (o e-mail aparece no do worker) | `docker compose logs -f worker` (ou `api`, `banco`, `redis`) |
| Subir mais de um worker | `docker compose up -d --scale worker=2` |
| Ver quantos pedidos esperam na fila | `docker compose exec redis redis-cli LLEN orders:email` |
| Parar só o worker (os pedidos esperam na fila) | `docker compose stop worker` e `docker compose start worker` |
| Parar **sem perder os dados** | `docker compose down` |
| Parar e **apagar os dados** (volume) | `docker compose down -v` |
| Consultar o banco | `docker compose exec banco psql -U ecommerce -d ecommerce -c 'SELECT * FROM "Order";'` |
| Validar o `compose.yaml` | `docker compose config` |

### Por que `npm run dev` direto na máquina não funciona mais

O `DATABASE_URL` aponta para o host `banco`, e o `REDIS_URL` para o host `redis`. Esses são nomes de serviço dentro da rede interna do Compose e só existem lá dentro. Além disso, o Postgres e o Redis **não publicam porta** para a sua máquina (de propósito), então não há como o Node de fora alcançá-los. Rode e teste sempre pelo Compose.

---

## Projeto 1: refatoração SOLID

### O ponto de partida

O código original concentrava tudo em um único método, `OrderController.processOrder`. Ele funcionava, mas era difícil de manter e de estender. Cinco responsabilidades diferentes conviviam no mesmo lugar:

| # | Responsabilidade | Violação |
|---|---|---|
| 1 | Validar a entrada | SRP: o controller decidia regras de negócio |
| 2 | Calcular preço e frete | OCP e LSP: um `if (product.type === 'physical')` por tipo de produto |
| 3 | Processar o pagamento | OCP: um `if/else` por forma de pagamento |
| 4 | Gravar no banco | DIP e SRP: o controller criava o `PrismaClient` e falava direto com o banco |
| 5 | Enviar o e-mail | DIP e SRP: o controller conhecia o Nodemailer e montava o HTML |

### O que foi feito, princípio por princípio

| Princípio | Problema no código original | Solução aplicada | Onde está a prova |
|---|---|---|---|
| **S** (responsabilidade única) | Um método fazia tudo | Cada responsabilidade ganhou uma classe própria: orquestração, notificação, persistência, pagamento | `services/OrderService.ts`, `services/NotificationService.ts` |
| **O** (aberto/fechado) | Pix exigiria editar um `if/else` no meio do fluxo | Cada forma de pagamento é uma classe que implementa `IPaymentMethod`. Para criar uma nova, basta uma classe nova e um registro | `payments/*`, em especial `PixPayment.ts`, criado sem editar nenhuma classe existente |
| **L** (substituição de Liskov) | O frete dependia de checar o tipo (string) do produto | `PhysicalProduct` e `DigitalProduct` implementam `IProduct`. O service chama `calculateFreight()` sem saber qual é qual | `domain/*` e o laço do `OrderService` |
| **I** (segregação de interfaces) | Não havia contratos | Interfaces pequenas, com poucas operações cada | `IPaymentMethod`, `IProductRepository`, `IOrderRepository`, `IMailProvider` |
| **D** (inversão de dependência) | O controller dependia de Prisma e Nodemailer | O service depende de interfaces. Quem conhece Prisma e Ethereal são as implementações | `repositories/*`, `providers/*` |

### Fluxo de um pedido (como ficou no Projeto 1)

```mermaid
sequenceDiagram
    participant C as OrderController
    participant PF as PaymentMethodFactory
    participant S as OrderService
    participant PR as IProductRepository
    participant PD as ProductFactory
    participant PM as IPaymentMethod
    participant OR as IOrderRepository
    participant N as NotificationService
    participant M as IMailProvider

    C->>PF: create(paymentMethod, paymentDetails)
    PF-->>C: IPaymentMethod
    C->>S: execute(customer, items, paymentMethod)
    loop para cada item do carrinho
        S->>PR: findById(productId)
        PR-->>S: dados do produto
        S->>PD: createProduct(dados)
        PD-->>S: IProduct (físico ou digital)
        S->>S: total += preço × quantidade + calculateFreight()
    end
    S->>PM: process(total)
    S->>OR: create(pedido)
    OR-->>S: pedido criado
    S->>N: sendOrderConfirmation(...)
    N->>M: sendMail(...)
    M-->>N: link de preview
    S-->>C: orderId e emailPreview
    C-->>C: responde 200
```

No Projeto 2 a escolha da forma de pagamento saiu do controller e foi para o service (veja o `PaymentMethodRegistry`).

### Decisões de design

| Decisão | Motivo |
|---|---|
| A refatoração **preserva o comportamento** do código original | Refatorar é mudar a estrutura sem mudar o que o sistema faz |
| Frete de R$ 10 **por linha** do carrinho (e não por unidade) | É assim que o código original calculava |
| Produto inexistente responde **400** | Mesmo status do original (404 seria defensável, mas mudaria o comportamento) |
| Débito **não valida** o CVV | O código original só recusava o CVV `000` no crédito |
| CVV `000` no crédito responde **500** | O original lançava um `Error` comum. Um `AppError` com status 402 seria mais correto, mas mudaria o comportamento |
| `AppError` com `statusCode` | Permite ao service sinalizar erros de negócio sem conhecer `req` e `res`. O controller traduz o erro em resposta HTTP |
| `ProductFactory` com um `if` por tipo | O `if` fica concentrado em **um único lugar**. Um tipo novo mexe só na factory |
| `getTestMessageUrl` dentro do `EtherealMailProvider` | É um detalhe do Ethereal. Outro provider pode nem ter esse conceito |
| O service serializa os itens com `JSON.stringify` | É o formato que o schema do Prisma espera. Em um design mais puro, essa conversão ficaria no repositório |
| `NotificationService` entra no `OrderService` como **classe concreta** | A tecnologia de e-mail já está protegida por `IMailProvider`. Uma interface própria seria um ganho pequeno para uma única implementação |
| Uma única instância do `PrismaClient` em `lib/prisma.ts` | Cada cliente abre suas próprias conexões. O módulo é executado uma só vez pelo Node, então todos recebem o mesmo objeto |
| Handlers do controller são arrow functions | O Express chama o método solto, e a arrow function mantém o `this` preso ao controller |

### Testes realizados

| Teste | Resultado |
|---|---|
| Livro físico, 1 unidade | Sucesso, total R$ 110 (R$ 100 + R$ 10 de frete) |
| E-book, 1 unidade | Sucesso, total R$ 50 (sem frete) |
| Carrinho vazio (`"items": []`) | 400, `Carrinho vazio` |
| Produto inexistente (`productId: 999`) | 400, `Produto 999 não encontrado` |
| Método `boleto` | 400, `Método de pagamento não suportado` |
| Pix com `paymentDetails: {}` | Sucesso |
| Pix sem o campo `paymentDetails` | Sucesso |
| Débito | Sucesso |
| Crédito com CVV `000` | 500, `Erro interno` |
| Débito com CVV `000` | Sucesso (o débito não valida o CVV, como no original) |

---

## Projeto 2: container IoC com InversifyJS

### Objetivo e motivação

No fim do Projeto 1, as classes recebiam tudo pelo construtor (injeção de dependência), mas a montagem era manual no `app.ts`:

```typescript
const notificationService = new NotificationService(mailProvider);
const orderService = new OrderService(productRepository, orderRepository, notificationService);
```

Esse arquivo precisa conhecer a **ordem** de criação, cresce a cada classe nova e é editado toda vez que se troca uma implementação. O objetivo do Projeto 2 foi entregar essa montagem a um **container de IoC** (InversifyJS) e provar que a infraestrutura pode ser trocada **sem tocar na regra de negócio**.

### O que mudou em relação ao Projeto 1

| Aspecto | Projeto 1 | Projeto 2 | Por quê |
|---|---|---|---|
| Montagem | `new` em cadeia no `app.ts` | Bindings declarativos em `container/container.ts` | O container resolve o grafo de dependências sozinho |
| Identificação das dependências | Tipos TypeScript (apagados na execução) | `Symbol`s em `container/types.ts` | Interfaces não existem em tempo de execução, então o container precisa de uma etiqueta real |
| Classes | Sem decorators | `@injectable()` na classe e `@inject(TYPES.X)` em **cada** parâmetro de construtor | O `tsx` não gera metadados de tipo, então o container não consegue deduzir os parâmetros |
| Pagamentos | `PaymentMethodFactory` criava `new CreditCardPayment(details)` a cada requisição | `PaymentMethodRegistry` recebe todos os métodos com `@multiInject`. Os dados do cartão vão como argumento de `process(amount, details)` | O container cria os objetos **uma vez**, na inicialização, quando ainda não existe cartão. Dado da requisição vai no método, e configuração vai no construtor |
| Quem escolhe o pagamento | O controller | O `OrderService`, usando o registro | O controller deixa de conhecer qualquer coisa de `payments/` |
| Escolha de implementações | Fixa no `app.ts` | Decidida pelo `APP_ENV` dentro do `container.ts` | Alternar entre `dev` e `test` sem alterar código |
| `app.ts` | Cria e liga tudo | Pede o `OrderController` ao container e registra a rota | A montagem saiu do ponto de entrada |

### Os dois modos

Veja a tabela em [Como rodar](#3-escolher-o-modo-de-execução). Duas classes foram criadas só para o modo `test`:

- `ConsoleMailProvider` (`providers/`): implementa `IMailProvider` e imprime o e-mail no console, sem depender de rede.
- `InMemoryOrderRepository` (`repositories/`): implementa `IOrderRepository` e guarda os pedidos em um array. É registrado como **singleton**, para que todos os consumidores compartilhem a mesma lista.

### Como verificar o isolamento

A regra do trabalho é que a escolha do modo e as classes concretas apareçam **só** no `container.ts`. Dois comandos provam isso. Ambos não devem encontrar nada:

```bash
# o APP_ENV só é lido no container
grep -rn "APP_ENV" src --include=*.ts | grep -v "src/container/container.ts"

# services e controllers não conhecem infraestrutura nem implementações de pagamento
grep -rniE "prisma|nodemailer|ethereal|inmemory|consolemail|CreditCardPayment|DebitCardPayment|PixPayment" src/services src/controllers
```

### Status do Projeto 2

- [x] InversifyJS 7, `reflect-metadata` e `dotenv` instalados e configurados
- [x] Pagamentos refatorados para `PaymentMethodRegistry` (sem estado)
- [x] `types.ts` criado e decorators aplicados em todas as classes
- [x] `ConsoleMailProvider` e `InMemoryOrderRepository` criados
- [x] `container.ts` montando tudo e escolhendo o modo pelo `APP_ENV`
- [x] `app.ts` enxuto
- [x] Totais corretos (produto 1 = R$ 110, produto 2 = R$ 50) nos dois modos
- [x] Modo `test` funcionando sem internet
- [x] Comandos de verificação sem resultados fora do `container.ts`

---

## Projeto 3: Docker Compose, PostgreSQL e GET /orders/:id

### Objetivo e motivação

Até o Projeto 2, a aplicação rodava direto na máquina e usava SQLite, um banco em arquivo. Isso funciona para estudar, mas gera o clássico "na minha máquina funciona": quem clona o projeto precisa ter o Node na versão certa, rodar migrações e torcer para o ambiente ser igual.

O Projeto 3 descreve o **ambiente inteiro em arquivos**. Com um único comando, `docker compose up --build`, sobem a API e um PostgreSQL, em qualquer máquina. Além disso, o trabalho pede uma funcionalidade nova, a rota `GET /orders/:id`, para provar que a arquitetura em camadas e o container de IoC absorvem mudanças sem retrabalho.

O trabalho tem duas frentes independentes:

| Frente | O que muda | O que **não** pode mudar |
|---|---|---|
| **A. Infraestrutura** | `schema.prisma`, `compose.yaml`, `.env.example` | Nenhum arquivo de `services/` ou `controllers/` por causa da troca de banco |
| **B. Funcionalidade** | `IOrderRepository`, os dois repositórios, `OrderService`, `OrderController`, `app.ts` | O `container.ts` (nenhuma classe nova, nenhum binding novo) |

### O que mudou em relação ao Projeto 2

| Aspecto | Projeto 2 | Projeto 3 | Por quê |
|---|---|---|---|
| Banco de dados | SQLite (`prisma/dev.db`, um arquivo) | PostgreSQL em um container próprio | Banco de verdade, com servidor, que roda igual em qualquer máquina |
| Criação das tabelas | `prisma migrate` (histórico de migrações) | `prisma db push`, executado pelo `npm start` | As migrações antigas tinham SQL do SQLite e não servem ao PostgreSQL |
| Como rodar | `npm run dev` na máquina | `docker compose up --build` | O ambiente inteiro é descrito em arquivos |
| Endereço do banco | Caminho de arquivo | `DATABASE_URL` com o host `banco` (nome do serviço) | Dentro do Compose, cada container é encontrado pelo nome do serviço |
| Persistência | Arquivo `dev.db` na pasta do projeto | Volume nomeado `postgres_data` | Os dados sobrevivem a `docker compose down` |
| Rotas | `POST /orders` | `POST /orders` e `GET /orders/:id` | Consulta de pedidos |
| Repositório de pedidos | Só `create` | `create` e `findById`, nas duas implementações | A rota nova precisa buscar um pedido |

### Arquitetura em containers

```mermaid
flowchart LR
    U["Cliente (curl, navegador)"] -->|"porta 3000"| API
    subgraph COMPOSE["Rede interna do Docker Compose"]
        API["api: Node 22, Express, Prisma"] -->|"banco:5432"| DB[("banco: PostgreSQL 16")]
        DB --- VOL[("volume postgres_data")]
    end
```

Só a `api` publica porta para a máquina. O `banco` fica acessível apenas pela rede interna, o que o protege de acessos externos.

### Os arquivos de Docker

| Arquivo | Para que serve |
|---|---|
| `Dockerfile` | Descreve a imagem da API: parte de `node:22-alpine`, instala as dependências com `npm ci`, copia o código, gera o cliente Prisma e executa `npm start` |
| `.dockerignore` | Impede que `node_modules`, `dist`, `.env` e logs entrem na imagem (a configuração chega pelo Compose, e não dentro da imagem) |
| `compose.yaml` | Orquestra os dois serviços (`banco` e `api`) e o volume |
| `.env.example` | Modelo da configuração: `APP_ENV` e `DATABASE_URL`. Quem clona copia para `.env` |
| Script `start` do `package.json` | `prisma db push && tsx prisma/seed.ts && tsx src/server.ts`: cria as tabelas, cadastra os produtos e sobe o servidor |

O `compose.yaml`:

```yaml
services:
  banco:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ecommerce
      POSTGRES_PASSWORD: abc
      POSTGRES_DB: ecommerce
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ecommerce -d ecommerce"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build: .
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      banco:
        condition: service_healthy

volumes:
  postgres_data:
```

| Chave | Decisão | Motivo |
|---|---|---|
| `banco.image: postgres:16-alpine` | Versão fixa | Evita surpresas quando sair uma versão nova |
| `POSTGRES_*` | Valores iguais aos do `DATABASE_URL` | Usuário, senha e nome do banco precisam coincidir com a URL, senão a API não autentica |
| `volumes` do banco | Volume nomeado ligado a `/var/lib/postgresql/data` | É a pasta onde o PostgreSQL guarda os dados. Com o volume, `down` e `up` não apagam os pedidos |
| `healthcheck` | `pg_isready` com o usuário e o banco certos | O banco só se declara pronto quando aceita conexões |
| `depends_on` com `service_healthy` | A API espera o healthcheck | `depends_on` sozinho só espera o container **iniciar**, e não o Postgres **aceitar conexões**. Sem isso, o `db push` falharia |
| `banco` **sem** `ports` | Porta não publicada | O banco é acessível só pela rede interna (critério de aceite) |
| `api.ports: "3000:3000"` | Única porta publicada | É a entrada da aplicação |
| `api.env_file: .env` | Entrega `APP_ENV` e `DATABASE_URL` ao container | A configuração fica fora da imagem |

### PostgreSQL no lugar do SQLite

A troca mexeu em três lugares: `provider` e `url` no `schema.prisma`, a pasta `prisma/migrations` (apagada) e o `.env.example`. Nenhum arquivo de `services/` ou `controllers/` foi alterado por causa dela, o que só é possível porque o Prisma ficou escondido atrás dos repositórios desde o Projeto 1.

```env
APP_ENV=dev
DATABASE_URL=postgresql://ecommerce:abc@banco:5432/ecommerce
```

| Parte da URL | Valor | O que é |
|---|---|---|
| Usuário | `ecommerce` | Igual a `POSTGRES_USER` |
| Senha | `abc` | Igual a `POSTGRES_PASSWORD` |
| Host | `banco` | **Nome do serviço** no Compose (e não o nome do banco) |
| Porta | `5432` | Porta padrão do PostgreSQL, na rede interna |
| Banco | `ecommerce` | **Nome do banco**, igual a `POSTGRES_DB` |

O host e o nome do banco são duas coisas diferentes. Confundi-las dá `database does not exist`.

### A rota `GET /orders/:id`

A rota atravessa as três camadas, e cada uma faz só o seu papel:

```mermaid
sequenceDiagram
    participant C as OrderController
    participant S as OrderService
    participant R as IOrderRepository

    C->>C: converte e valida o id
    C->>S: getById(id)
    S->>R: findById(id)
    R-->>S: pedido ou null
    alt pedido não encontrado
        S-->>C: lança AppError 404
        C-->>C: responde 404
    else pedido encontrado
        S-->>C: pedido
        C-->>C: responde 200
    end
```

| Camada | Responsabilidade | Detalhe |
|---|---|---|
| `OrderController.getOrder` | Só HTTP: lê o `id` da URL, converte e valida, chama o service e devolve 200 ou o erro | Não acessa repositório nem Prisma |
| `OrderService.getById` | Regra de negócio: pedido inexistente é erro | Lança `AppError` com status **404** |
| `IOrderRepository.findById` | Busca o pedido | Devolve o pedido ou `null` (não achar é um resultado normal de busca, e não uma falha) |
| `PrismaOrderRepository` / `InMemoryOrderRepository` | Implementações do contrato | A rota funciona nos dois modos, sem tocar no `container.ts` |

A rota funciona nos dois modos sem alterar o `container.ts`, porque o container já entrega ao service o repositório certo conforme o `APP_ENV`.

### Decisões de design e armadilhas

| Decisão | Motivo |
|---|---|
| `db push` em vez de migrações | Para um trabalho acadêmico basta. Em produção, o recomendado seria `migrate`, que mantém histórico |
| `findById` devolve `null` e o **service** lança o erro | "Não achei" é um resultado de busca. Decidir que isso é um problema é regra de negócio |
| O tipo `Order` é declarado em `IOrderRepository.ts` | Se a interface importasse o tipo do Prisma, voltaria a depender dele (DIP quebrado) |
| Validação do id com `Number.isInteger`, `> 0` e teto de `2147483647` | `Number('1.5')` passaria numa checagem só de `NaN`, e o Prisma lançaria um erro (500). O teto é o maior valor do `Int` do PostgreSQL |
| A conversão do id mora no controller | Transformar o texto da URL em número é uma preocupação de HTTP |
| Erro de id inválido responde 400 | É um erro do cliente, e não do servidor |
| `items` volta como **texto JSON** na resposta do GET | É o formato gravado no banco. Devolver uma lista exigiria um `JSON.parse` no service, simétrico ao `JSON.stringify` da criação |
| `handleError` compartilhado entre `processOrder` e `getOrder` | O tratamento de erro vive em um lugar só, e todas as respostas de erro seguem o formato `{"error": "..."}` |
| O erro inesperado usa o `logger` (Winston) | Mantém um único destino de logs na aplicação |
| Seed com `upsert` | O `npm start` roda o seed a **cada** subida do container. Com `upsert`, os produtos não duplicam, mesmo com o volume persistente |
| Credenciais (`abc`) no `compose.yaml` | Aceitável em um trabalho acadêmico. Em projetos reais, usar segredos |
| O modo `test` ainda usa o PostgreSQL para os produtos | O enunciado troca só o e-mail e o repositório de pedidos |

### Problemas encontrados no caminho

| Sintoma | Causa | Correção |
|---|---|---|
| `FATAL: database "ecommerce" does not exist` | `POSTGRES_DB` com um nome diferente do banco da URL (confusão entre o host `banco` e o nome do banco) | `POSTGRES_DB: ecommerce` |
| `FATAL: role "postgres" does not exist` repetido nos logs do banco | O healthcheck usava `-U postgres`, mas o usuário criado é `ecommerce` | `pg_isready -U ecommerce -d ecommerce` |
| Os dados sumiam depois de `docker compose down` | O volume estava ligado a `/var/lib/postgres/data` (faltava o `ql`), então os dados iam para um volume anônimo | `/var/lib/postgresql/data` |
| As credenciais corrigidas não surtiam efeito | O Postgres só lê `POSTGRES_*` na **primeira** inicialização do volume | `docker compose down -v` e subir de novo (apaga os dados) |
| `GET /orders/1.5` respondia 500 | A validação checava só `NaN` | `Number.isInteger` |

### Estrutura ao final do Projeto 3

```text
.dockerignore                # NOVO
.env.example                 # MUDOU: APP_ENV e DATABASE_URL (PostgreSQL)
Dockerfile                   # NOVO
compose.yaml                 # NOVO
package.json                 # MUDOU: script start (db push, seed e servidor)
prisma/
├── schema.prisma            # MUDOU: provider postgresql, url vinda de env
└── seed.ts                  # upsert: pode rodar várias vezes sem duplicar
src/
├── container/
│   ├── types.ts             # um Symbol para cada dependência
│   └── container.ts         # único arquivo que importa classes concretas (não mudou)
├── controllers/
│   └── OrderController.ts   # MUDOU: getOrder e handleError
├── domain/
│   ├── IProduct.ts
│   ├── PhysicalProduct.ts
│   ├── DigitalProduct.ts
│   └── ProductFactory.ts
├── errors/
│   └── AppError.ts
├── lib/
│   ├── logger.ts
│   ├── mail.ts
│   └── prisma.ts
├── payments/
│   ├── IPaymentMethod.ts
│   ├── CreditCardPayment.ts
│   ├── DebitCardPayment.ts
│   ├── PixPayment.ts
│   └── PaymentMethodRegistry.ts
├── providers/
│   ├── IMailProvider.ts
│   ├── EtherealMailProvider.ts
│   └── ConsoleMailProvider.ts
├── repositories/
│   ├── IOrderRepository.ts           # MUDOU: tipo Order e findById
│   ├── IProductRepository.ts
│   ├── PrismaOrderRepository.ts      # MUDOU: findById
│   ├── PrismaProductRepository.ts
│   └── InMemoryOrderRepository.ts    # MUDOU: findById
├── services/
│   ├── OrderService.ts      # MUDOU: getById
│   └── NotificationService.ts
├── app.ts                   # MUDOU: rota GET /orders/:id
└── server.ts
```

`prisma/migrations` e `prisma/dev.db` não existem mais.

### Como verificar os critérios de aceite

```bash
# Os controllers não acessam repositório nem Prisma (não deve achar nada)
grep -rniE "prisma|repository" src/controllers || echo "OK"

# A porta do PostgreSQL não está publicada
docker compose port banco 5432 || echo "OK: sem porta publicada"
grep -n "ports" compose.yaml      # aparece uma única vez, dentro do serviço api
```

Para verificar o critério do clone limpo, simule o que um avaliador faria:

```bash
git clone <url-do-repositório> /tmp/teste-entrega
cd /tmp/teste-entrega/ecommerce-versao-com-erros-solid
cp .env.example .env
docker compose up --build
```

### Testes

| Teste | Esperado |
|---|---|
| `POST /orders` (Pix, produto 1) | 200 e um `orderId` |
| `GET /orders/<orderId>` | 200 com o pedido (total 110, status `confirmed`) |
| `GET /orders/9999` | 404, `Pedido não encontrado` |
| `GET /orders/abc` | 400, `Id inválido` |
| `GET /orders/1.5` | 400, `Id inválido` |
| `GET /orders/99999999999` | 400, `Id inválido` |
| Persistência (modo `dev`): pedido, `docker compose down`, `docker compose up`, `GET` | O pedido continua lá |
| Seed: dois ciclos de `down`/`up` e contagem de produtos | Continuam 2 |
| Modo `test`: POST e GET | Funcionam. Depois de recriar a API, o GET dá 404 (os pedidos estavam em memória) |

### Status do Projeto 3

<!-- Marque as caixas que você já confirmou. -->

- [x] `schema.prisma` com PostgreSQL e pasta `migrations` removida
- [x] `compose.yaml` com `banco` (healthcheck, volume, sem porta publicada) e `api`
- [x] `findById` nos dois repositórios, `getById` no service, `getOrder` no controller e rota registrada
- [x] `GET` devolve 200, 404 para pedido inexistente e 400 para id inválido
- [x] Persistência dos pedidos confirmada depois de `down` e `up`
- [x] Seed sem duplicar confirmado
- [x] Rota testada no modo `test` pelo Compose
- [x] Clone limpo testado (`cp .env.example .env` e `docker compose up --build`)
- [x] Repositório público conferido em janela anônima

---

## Projeto 4: fila no Redis, worker e ADR

### Objetivo e motivação

Até o Projeto 3, o e-mail de confirmação era enviado **dentro** da requisição `POST /orders`. Isso causava dois problemas:

1. **A resposta ficava lenta**, porque esperava a ida e volta ao servidor SMTP.
2. **Uma falha no e-mail derrubava um pedido já pago e gravado.** O cliente recebia 500, tentava de novo, e o pedido era duplicado.

O Projeto 4 separa quem **recebe** o pedido de quem **envia** o e-mail. A API grava o pedido, deixa um recado numa **fila do Redis** e responde. Um **worker**, em outro container, lê a fila e envia o e-mail. A decisão completa, com as alternativas e os custos, está no [ADR 001](docs/adr-001-fila-de-email.md).

### O que mudou em relação ao Projeto 3

| Aspecto | Projeto 3 | Projeto 4 | Por quê |
|---|---|---|---|
| Envio do e-mail | Dentro do `OrderService`, antes de responder | Em um **worker** separado | A resposta não espera mais o e-mail, e uma falha nele não afeta o pedido |
| `OrderService` | Chamava o `NotificationService` | Grava o pedido e **publica** na fila (`IOrderQueue`) | O service conhece só a interface da fila |
| Fila | Não existia | Lista do Redis (`LPUSH` / `BRPOP`) | Mensagens esperam com o worker parado, e cada uma vai para um só worker |
| Containers | `banco` e `api` | `banco`, `redis`, `api` e `worker` | O worker roda a mesma imagem da API com outro comando |
| `POST /orders` | Devolvia `orderId` e `emailPreview` | Devolve só `orderId` | O e-mail ainda não foi enviado quando a resposta sai |
| Onde o e-mail aparece | Na resposta | No **log do worker** | Idem |
| `NotificationService` | Chamado pelo `OrderService` | Chamado pelo worker, com um método novo que recebe a mensagem da fila | O worker fica fino |
| `container.ts` | Registrava os serviços | Registra também a `RedisOrderQueue` | Continua sendo o único arquivo que conhece classes concretas |

### Arquitetura

```mermaid
flowchart LR
    U["Cliente (curl, navegador)"] -->|"porta 3000"| API
    subgraph COMPOSE["Rede interna do Docker Compose"]
        API["api: Express"] -->|"banco:5432"| DB[("banco: PostgreSQL")]
        API -->|"LPUSH orders:email"| R[("redis: fila")]
        R -->|"BRPOP"| W["worker (uma ou mais réplicas)"]
    end
    W -->|"SMTP, no modo dev"| ML["Ethereal"]
```

Só a `api` publica porta para a máquina. O `banco` e o `redis` ficam acessíveis apenas pela rede interna.

### Fluxo de um pedido

```mermaid
sequenceDiagram
    participant C as OrderController
    participant S as OrderService
    participant OR as IOrderRepository
    participant Q as IOrderQueue
    participant R as Redis
    participant W as Worker
    participant N as NotificationService
    participant M as IMailProvider

    C->>S: execute(pedido)
    S->>OR: create(pedido)
    OR-->>S: pedido gravado
    S->>Q: publish(pedido)
    Q->>R: LPUSH
    S-->>C: orderId
    C-->>C: responde 200, sem esperar o e-mail
    Note over R,W: depois, de forma independente
    W->>R: BRPOP (espera até chegar um item)
    R-->>W: mensagem
    W->>N: sendOrderConfirmationFromMessage(mensagem)
    N->>M: sendMail(...)
    W->>W: registra no log: Email do pedido #id enviado
```

### Por que uma lista e não publish/subscribe

| | Lista (`LPUSH` / `BRPOP`) | Publish/subscribe |
|---|---|---|
| Worker parado | A mensagem **espera** na lista | A mensagem **se perde** |
| Dois workers | Cada mensagem vai para **um só** (o `BRPOP` é atômico) | **Todos** recebem: o e-mail sairia duas vezes |
| Modelo | Fila de trabalho: divide o trabalho | Difusão: repete o evento para todos |

O pub/sub falharia nos dois cenários que o projeto exige (worker parado e dois workers). O argumento completo está no ADR.

### A mensagem da fila

O Redis só guarda texto, então o pedido é serializado em JSON. Só os campos que o e-mail precisa entram na mensagem:

| Campo | Tipo | Observação |
|---|---|---|
| `id` | número | Número do pedido (aparece no assunto do e-mail e no log do worker) |
| `customer` | texto | Destinatário |
| `total` | número | Valor do pedido |
| `items` | texto JSON | Os produtos com a quantidade, como gravados no banco. O worker reconstrói os produtos com a `ProductFactory` |

O `createdAt` fica de fora, porque um `Date` viraria texto ao passar por JSON. Métodos de classe também não atravessam a fila: só dados.

### Os arquivos do Projeto 4

| Arquivo | Papel |
|---|---|
| `src/queues/IOrderQueue.ts` | Contrato da fila (`publish`) e o tipo `OrderMessage`. Não importa o Redis |
| `src/queues/RedisOrderQueue.ts` | Implementação: serializa o pedido e faz o `LPUSH`. É a única classe da API que conhece o Redis |
| `src/queues/queueNames.ts` | O nome da lista (`orders:email`), em um lugar só, usado pela API e pelo worker |
| `src/lib/redis.ts` | Cliente Redis único (como o `lib/prisma.ts`), com falha imediata se faltar o `REDIS_URL` |
| `src/worker.ts` | Segundo ponto de entrada: lê a fila com `BRPOP` e envia o e-mail |
| `src/services/OrderService.ts` | Grava, publica e responde |
| `src/services/NotificationService.ts` | Ganhou `sendOrderConfirmationFromMessage` |
| `src/container/container.ts` e `types.ts` | Registram a `RedisOrderQueue` (singleton) |
| `compose.yaml` | Serviços `redis` e `worker` |
| `docs/adr-001-fila-de-email.md` | Registro da decisão |

### Os serviços novos do Compose

| Serviço | Decisão | Motivo |
|---|---|---|
| `redis` | Imagem `redis:7-alpine`, **sem `ports`** | Só os containers da rede interna falam com ele |
| `redis` | Healthcheck com `redis-cli ping` | A `api` e o `worker` só sobem quando o Redis responde |
| `redis` | Persistência AOF (`--appendonly yes`) e volume `redis_data` | Os pedidos que esperam na fila sobrevivem a um restart do Redis |
| `worker` | `build: .` (o mesmo `Dockerfile` da API) | Uma imagem, dois usos |
| `worker` | `command: npm run worker` | Substitui o `CMD` do Dockerfile (`npm start`), que criaria as tabelas e subiria o servidor |
| `worker` | Sem `container_name` e sem porta publicada | Permite `docker compose up -d --scale worker=2` |
| `worker` | `restart: unless-stopped` | Se o processo cair, o Docker o levanta de novo |
| `api` | `depends_on` também do `redis` (`service_healthy`) | A API publica na fila, então o Redis precisa estar pronto |

### Decisões de design e armadilhas

| Decisão | Motivo |
|---|---|
| A `RedisOrderQueue` é registrada **fora** do `if/else` dos modos | API e worker são processos diferentes. Uma fila em memória não atravessa processos, então nos dois modos a fila é o Redis |
| Se o `publish` falhar, a API registra o erro (com o número do pedido) e **responde normalmente** | O pedido já foi pago e gravado, e uma tarefa secundária não pode invalidá-lo. O custo é uma falha silenciosa (ver o ADR) |
| O `try/catch` do worker fica **dentro** do laço | Uma mensagem estragada ou uma falha de e-mail não pode derrubar o worker, senão os pedidos seguintes ficam parados |
| A mensagem que falhou é registrada no log do worker | O `BRPOP` já a retirou da fila, então o log é o único rastro dela |
| `BRPOP` com tempo limite de 5 segundos | Com `0`, o laço nunca "acordaria" para olhar o pedido de parada |
| O worker trata `SIGTERM` e `SIGINT` | Termina o e-mail em andamento antes de sair, para não perder uma mensagem já retirada |
| Se a leitura da fila falhar, o worker espera um pouco e tenta de novo | Uma queda breve do Redis não derruba o processo |
| O número do pedido vai na linha de log do envio | É o que permite provar que cada pedido foi enviado uma vez só (critério 4) |
| O método novo mora no `NotificationService` | O worker fica fino (só lê da fila e repassa), e a conversão "mensagem → produtos" fica em um service testável |
| O `NotificationService` continua registrado no container | Deixou de ser usado pelo `OrderService`, mas o worker o pega do container |
| O `worker.ts` começa com `import 'reflect-metadata'` e `import 'dotenv/config'` | É um ponto de entrada novo: sem eles, os decorators do Inversify e o `APP_ENV` não funcionam |
| `container.get` só aparece no `worker.ts` e no `app.ts` | A "raiz" da aplicação. Dentro de um service, viraria um *service locator* |
| Conexão preguiçosa com o Redis na API | A primeira publicação abre a conexão e as seguintes a reaproveitam |

### Estrutura: o que o Projeto 4 acrescenta

```text
compose.yaml                     # MUDOU: serviços redis e worker, api espera o redis
.env.example                     # MUDOU: REDIS_URL
package.json                     # MUDOU: dependência redis e script worker
docs/
└── adr-001-fila-de-email.md     # NOVO
src/
├── queues/                      # NOVO
│   ├── IOrderQueue.ts
│   ├── RedisOrderQueue.ts
│   └── queueNames.ts
├── lib/
│   └── redis.ts                 # NOVO
├── container/
│   ├── types.ts                 # MUDOU: símbolo OrderQueue
│   └── container.ts             # MUDOU: bind da RedisOrderQueue
├── services/
│   ├── OrderService.ts          # MUDOU: publica na fila em vez de notificar
│   └── NotificationService.ts   # MUDOU: sendOrderConfirmationFromMessage
├── controllers/
│   └── OrderController.ts       # MUDOU: a resposta do POST não tem emailPreview
└── worker.ts                    # NOVO
```

### Como verificar os critérios de aceite

| # | Critério | Como provar |
|---|---|---|
| 1 | Clone limpo sobe sem erro | Em uma pasta temporária: clone, `cp .env.example .env`, `docker compose up --build`, e `docker compose ps` com os quatro serviços de pé |
| 2 | `POST` não espera o e-mail | `curl -s -o /dev/null -w "%{time_total}\n" -X POST ...` (resposta rápida) e depois `docker compose logs worker` (o e-mail aparece lá) |
| 3 | Worker parado, os pedidos esperam | `docker compose stop worker`, faça alguns `POST`, `docker compose exec redis redis-cli LLEN orders:email` (o número cresce), `docker compose start worker` (os e-mails saem e o `LLEN` volta a 0) |
| 4 | Dois workers, cada pedido uma vez | `docker compose up -d --scale worker=2`, envie vários `POST` e rode `docker compose logs worker \| grep -o "pedido #[0-9]*" \| sort \| uniq -d` (não deve imprimir nada) |
| 5 | `services/` e `controllers/` não importam o Redis | `grep -rniE "redis" src/services src/controllers \|\| echo OK` |
| 6 | ADR no repositório | `ls docs/adr-001-fila-de-email.md` |

Verificação extra: `docker compose port redis 6379` não deve devolver nenhum endereço (a porta não está publicada).

### Status do Projeto 4

<!-- Marque as caixas conforme confirmar cada item rodando o projeto. -->

- [x] `npm install redis`, script `worker` e `REDIS_URL` configurados
- [x] `IOrderQueue`, `RedisOrderQueue`, `lib/redis.ts` e o bind no container
- [x] `OrderService` publica na fila em vez de chamar o `NotificationService`
- [x] `worker.ts` consumindo a fila e enviando o e-mail
- [x] `compose.yaml` com `redis` (sem porta publicada) e `worker`
- [x] Critério 2: o `POST` responde sem esperar o e-mail
- [x] Critério 3: com o worker parado, os pedidos esperam e saem ao religar
- [x] Critério 4: com dois workers, nenhum pedido repetido
- [x] Critério 5: nenhum arquivo de `services/` ou `controllers/` importa o Redis
- [x] Critério 6: o ADR está no repositório
- [x] Clone limpo testado e repositório público conferido em janela anônima

---

## Conceitos aplicados

| Conceito | Resumo | Onde aparece |
|---|---|---|
| **SRP** | Uma classe tem um único motivo para mudar | Todas as camadas |
| **OCP** | Estender sem modificar o que já funciona | Formas de pagamento |
| **LSP** | Subtipos substituem o tipo base sem o cliente saber qual é | Produtos físicos e digitais |
| **ISP** | Interfaces pequenas e específicas | Contratos de repositório, provider e pagamento |
| **DIP** | O alto nível depende de abstrações, e as implementações dependem das mesmas abstrações | Repositórios e provider de e-mail |
| **Strategy** | Família de algoritmos intercambiáveis atrás de uma interface | `IPaymentMethod` |
| **Factory** | Centraliza a decisão de qual classe instanciar | `ProductFactory` |
| **Registry** | Guarda objetos por nome e os entrega sob demanda | `PaymentMethodRegistry` |
| **Repository** | Esconde o acesso a dados atrás de um contrato | `IOrderRepository` e `IProductRepository` |
| **Injeção de dependência** | A classe recebe o que precisa, em vez de criar | Construtores dos services e do controller |
| **Inversão de Controle** | Um container, e não o código da aplicação, cria e liga os objetos | Projeto 2 |
| **Singleton (escopo)** | Uma única instância reaproveitada por todos | Repositórios e provider de e-mail no container |
| **Fail fast** | Falhar logo onde o problema nasce | Registro de pagamentos, validação do `APP_ENV` |
| **Imagem e container** | A imagem é a receita congelada, o container é ela em execução | `Dockerfile` e serviço `api` |
| **Orquestração (Compose)** | Define vários containers, a rede entre eles e os volumes em um único arquivo | `compose.yaml` |
| **Volume** | Pasta que sobrevive ao container | `postgres_data` |
| **Healthcheck** | Comando que informa se um serviço está realmente pronto | `pg_isready` no `banco` e `redis-cli ping` no `redis` |
| **Fila de mensagens** | Um intermediário onde o produtor deixa o trabalho e o consumidor o retira depois | Lista do Redis entre a `api` e o `worker` |
| **Produtor e consumidor** | Quem coloca as mensagens na fila e quem as processa | `RedisOrderQueue` (API) e `worker.ts` |
| **Lista FIFO no Redis** | `LPUSH` insere de um lado e `BRPOP` retira do outro, mantendo a ordem de chegada | Fila `orders:email` |
| **Operação bloqueante** | O comando espera (sem consumir CPU) até haver algo para ler | `BRPOP` com tempo limite |
| **Atomicidade** | A retirada de um item da lista é indivisível, então cada item vai para um só consumidor | Dois workers sem e-mail duplicado |
| **Entrega no máximo uma vez** | A mensagem é retirada antes de ser processada: sem duplicar, mas pode se perder se o consumidor cair | `BRPOP` (ver o ADR) |
| **Encerramento limpo** | Terminar o trabalho em andamento ao receber o sinal de parada | Tratamento de `SIGTERM` no worker |
| **ADR** | Documento curto que registra uma decisão de arquitetura e seus motivos | `docs/adr-001-fila-de-email.md` |

---

## Limitações e melhorias futuras

- O pagamento é **simulado**: não há integração com gateway real.
- Uma recusa de cartão responde 500, mas semanticamente seria um erro do cliente (por exemplo, 402 com `AppError`).
- Não há testes automatizados. O modo `test` e as interfaces tornam isso viável (um `OrderService` com repositório em memória roda sem banco).
- A rota `GET /orders/:id` devolve `items` como texto JSON. Uma versão mais amigável converteria para lista no service.
- Não há rota para **listar** pedidos, nem paginação, nem autenticação (qualquer pessoa com o id lê o pedido).
- `prisma db push` não mantém histórico de mudanças do banco. Em produção, o recomendado são migrações.
- As credenciais do banco estão em texto no `compose.yaml` e no `.env.example`. Em produção, usar segredos.
- O `NotificationService` poderia ter uma interface (`INotificationService`) para ser trocado por outro canal, como SMS.
- Um *middleware* de erro do Express devolveria sempre JSON limpo, inclusive para corpos inválidos (hoje o Express devolve uma página HTML com o caminho de arquivos).
- O `PrismaClient` poderia ser injetado nos repositórios pelo construtor, o que facilitaria testes e o encerramento da conexão.
- O Postgres não publica porta, então ferramentas como Prisma Studio ou clientes de banco da máquina não conseguem se conectar. Para depurar, é possível publicar a porta temporariamente ou usar `docker compose exec banco psql`.
- O e-mail é enviado com entrega **no máximo uma vez**: se o worker cair depois de retirar a mensagem da fila, aquele e-mail se perde. Não há reenvio automático nem fila de mensagens com falha (veja o ADR 001).
- Se a API não conseguir publicar na fila, ela registra o erro no log e responde normalmente, então o cliente não é avisado de que o e-mail não vai sair.
- Os e-mails que falham ficam apenas no log do worker, sem painel de acompanhamento.
- A fila não tem testes automatizados. Um `FakeOrderQueue` em memória permitiria testar o `OrderService` sem Redis.

---

Autor: Thiago Caixeta.
