# Projeto Legacy - E-commerce Monolítico

# E-commerce SOLID: do código legado ao container Docker

Backend de e-commerce em TypeScript usado em três trabalhos encadeados da disciplina de Arquitetura de Software. Cada trabalho continua o anterior, por isso os três vivem neste mesmo repositório, e a explicação de cada um está em uma seção deste README.

| | Projeto 1 | Projeto 2 | Projeto 3 |
|---|---|---|---|
| **Tema** | Refatoração aplicando SOLID | Inversão de Controle com InversifyJS | Containers com Docker Compose e PostgreSQL |
| **Ponto de partida** | Um `OrderController` "God Class" com toda a lógica | O resultado do Projeto 1, com montagem manual (`new`) | O resultado do Projeto 2, rodando direto na máquina com SQLite |
| **Resultado** | Responsabilidades separadas em camadas, ligadas por interfaces | Montagem automática por container, com os modos `dev` e `test` | API e banco em containers, PostgreSQL no lugar do SQLite e a rota `GET /orders/:id` |

## Sumário

1. [Visão geral e tecnologias](#visão-geral-e-tecnologias)
2. [Como rodar](#como-rodar)
3. [Projeto 1: refatoração SOLID](#projeto-1-refatoração-solid)
4. [Projeto 2: container IoC com InversifyJS](#projeto-2-container-ioc-com-inversifyjs)
5. [Projeto 3: Docker Compose, PostgreSQL e GET /orders/:id](#projeto-3-docker-compose-postgresql-e-get-ordersid)
6. [Conceitos aplicados](#conceitos-aplicados)
7. [Limitações e melhorias futuras](#limitações-e-melhorias-futuras)

---

## Visão geral e tecnologias

A API recebe pedidos em `POST /orders` (valida o carrinho, calcula total e frete, processa o pagamento, grava o pedido e envia um e-mail de confirmação) e permite consultá-los em `GET /orders/:id`.

| Camada | Tecnologia |
|---|---|
| Linguagem e execução | TypeScript, Node.js 22, `tsx` |
| HTTP | Express |
| Banco de dados | PostgreSQL 16 com Prisma (SQLite nos Projetos 1 e 2) |
| Logs | Winston |
| E-mail | Nodemailer com Ethereal (caixa de e-mail de teste) |
| Injeção de dependência | InversifyJS 7 e `reflect-metadata` |
| Variáveis de ambiente | `dotenv` |
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

1. O serviço `banco` (PostgreSQL) inicia e fica `healthy`.
2. O serviço `api` só inicia depois disso.
3. A `api` executa `npm start`: cria as tabelas (`prisma db push`), cadastra os produtos (seed) e sobe o servidor em `http://localhost:3000`.

### 3. Escolher o modo de execução

Os modos são definidos **só** pela variável `APP_ENV` no arquivo `.env`. Nenhum código precisa mudar para alternar entre eles.

| | `APP_ENV=dev` | `APP_ENV=test` |
|---|---|---|
| **E-mail** | `EtherealMailProvider`: envia para o Ethereal e devolve um link de visualização | `ConsoleMailProvider`: imprime o e-mail no console do servidor |
| **Pedidos** | `PrismaOrderRepository`: gravados no PostgreSQL | `InMemoryOrderRepository`: guardados em um array na memória (somem ao reiniciar a API) |
| **Internet** | Necessária para o e-mail (Ethereal) | Não necessária |
| **`emailPreview` na resposta** | Link do Ethereal | `null` |

<!-- CONFIRMAR: o que o ConsoleMailProvider retorna e o valor de emailPreview no modo test. -->

> O catálogo de **produtos** vem do PostgreSQL nos dois modos. Por isso o serviço `banco` é necessário mesmo em `test`.

Para trocar de modo, edite o `.env` e **recrie a API** (reiniciar não relê o arquivo):

```bash
# exemplo: APP_ENV=test no .env, e depois
docker compose up -d --force-recreate api
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
  "orderId": 1,
  "emailPreview": "https://ethereal.email/message/..."
}
```

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
| Ler os logs da API ou do banco | `docker compose logs api` / `docker compose logs banco` |
| Parar **sem perder os dados** | `docker compose down` |
| Parar e **apagar os dados** (volume) | `docker compose down -v` |
| Consultar o banco | `docker compose exec banco psql -U ecommerce -d ecommerce -c 'SELECT * FROM "Order";'` |
| Validar o `compose.yaml` | `docker compose config` |

### Por que `npm run dev` direto na máquina não funciona mais

O `DATABASE_URL` aponta para o host `banco`, que é o nome do serviço dentro da rede interna do Compose. Esse nome só existe lá dentro. Além disso, o Postgres **não publica porta** para a sua máquina (de propósito), então não há como o Node de fora alcançá-lo. Rode e teste sempre pelo Compose.

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
- [ ] Persistência dos pedidos confirmada depois de `down` e `up`
- [ ] Seed sem duplicar confirmado
- [ ] Rota testada no modo `test` pelo Compose
- [ ] Clone limpo testado (`cp .env.example .env` e `docker compose up --build`)
- [ ] Repositório público conferido em janela anônima

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
| **Healthcheck** | Comando que informa se um serviço está realmente pronto | `pg_isready` no serviço `banco` |

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

---

Autor: Thiago
