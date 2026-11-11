# Workflow revisado y diagramas

## Actualización de implementación — 2026-11-11

El flujo de apertura de caja, comprobante comercial y confirmación compuesta de sync
se describe en [Caja y comprobantes](../CAJA_COMPROBANTES_20261111.md), con sus pruebas
locales y límites remotos. Los diagramas de auditoría siguientes conservan su contexto
histórico; no acreditan el despliegue de esta migración en Supabase.

Referencia: ficha técnica del proyecto y casos E1–E8 del usuario. Se contrastaron
con router, repositorio, mapeadores, cola y SQL. Los diagramas distinguen **actual**
y **objetivo**; el objetivo no indica que esas funciones estén implementadas.
Se pueden renderizar en visores Markdown compatibles con Mermaid.
También están [exportados y verificados como SVG](diagramas/README.md).

## 1. Mapa de casos de uso objetivo

Mermaid no proporciona aquí UML use-case nativo; se usa un grafo equivalente de
actores y casos de uso. El detalle de permisos está en SUPABASE_LOCAL_ONLINE.md.

```mermaid
flowchart LR
 A[Dueño / administrador]
 V[Vendedor / cajero]
 C[Cocinero]
 subgraph Sistema[Pollito Pleibi - objetivo]
  U1([Administrar productos, categorías y precios])
  U2([Administrar recetas, compras y proveedores])
  U3([Abrir caja y registrar venta])
  U4([Cobrar y emitir recibo])
  U5([Preparar y entregar orden])
  U6([Registrar inventario y movimientos autorizados])
  U7([Anular con motivo y autorización])
  U8([Cerrar caja y conciliar])
  U9([Analizar reportes y exportar])
  U10([Administrar usuarios y consultar auditoría])
 end
 A --> U1
 A --> U2
 A --> U6
 A --> U7
 A --> U8
 A --> U9
 A --> U10
 V --> U3
 V --> U4
 V --> U7
 V --> U8
 C --> U5
 C --> U6
 U3 --> U5
 U4 --> U9
 U6 --> U2
```

Cajero y cocinero no reciben automáticamente todos los permisos de los casos
compartidos: anulación/ajuste/cierre deben comprobar autorización y propiedad.

## 2. Flujo actual comprobado

```mermaid
flowchart TD
 L[Login Auth o fallback local] --> R[Rol y navegación local]
 R --> P[POS: catálogo y carrito]
 P --> M[Cobro: cliente y un método]
 M --> O[createOrder: UUID, contador local y snapshots]
 O --> D[Guardar orden en IndexedDB]
 D --> Q[Guardar outbox por separado]
 Q --> K[Cocina local: Nueva a Entregada]
 Q --> S[Sincronizar al tener red]
 S --> MAP[toRemote orders]
 MAP --> H[POST cabecera ordenes]
 H --> DET[Helpers reciben objeto remoto sin items]
 DET --> N[Cero detalles transmitidos en la prueba]
 N --> PAY[pagoRow espera campos locales]
 PAY --> ERR[Pago efectivo por default incluso en pendiente]
 H --> FAIL[Si una petición posterior falla: estado parcial]
 classDef risk fill:#ffe1df,stroke:#a52020,color:#650000
 class Q,N,ERR,FAIL risk
```

No hay receta/caja integradas en este recorrido. No confundir creación del ticket
por trigger con venta, pagos y consumo de stock en una sola transacción.

## 3. Flujo de venta objetivo

```mermaid
flowchart TD
 START[Usuario autenticado y activo] --> ROLE{Acción permitida}
 ROLE -->|No| DENY[Denegar y registrar evento]
 ROLE -->|Sí| BOX{Caja requerida y disponible}
 BOX -->|No| STOP[Explicar bloqueo o política explícita]
 BOX -->|Sí| CART[Productos, cantidades, notas y canal]
 CART --> CALC[Precio snapshot, descuentos e impuestos]
 CALC --> PAYMENT[Validar recibido y desglose de pagos]
 PAYMENT --> LOCAL[Persistir operación y outbox atómicamente]
 LOCAL --> NET{Red disponible}
 NET -->|No| WAIT[Pendiente local visible, política offline]
 WAIT -->|Reconectar| TX[RPC idempotente autorizada]
 NET -->|Sí| TX
 TX --> STOCK{Stock y reglas válidos}
 STOCK -->|No| ROLLBACK[Rechazo/rollback y resolución local]
 STOCK -->|Sí| COMMIT[Orden, detalles, pagos, consumo, ledger y auditoría]
 COMMIT --> ACK[ACK completo: conciliar y retirar pendiente]
 ACK --> KDS[Cocina, recibo y reportes]
```

La política offline debe definir si se puede aceptar venta sin stock central
confirmado y cómo se resuelven conflictos; una cola no decide esa política.

## 4. Secuencia de sincronización y reintento objetivo

```mermaid
sequenceDiagram
 actor Cajero
 participant UI as POS
 participant Local as IndexedDB
 participant API as Servicio de venta
 participant DB as PostgreSQL
 Cajero->>UI: Confirmar venta
 UI->>Local: Transacción: operación UUID + outbox
 Local-->>UI: Guardado local
 UI->>API: UUID de operación y solicitud autenticada
 API->>DB: BEGIN, verificar rol/activo/caja/idempotencia
 alt Operación ya aplicada
  DB-->>API: Resultado existente con el mismo UUID
 else Operación nueva válida
  API->>DB: Validar stock/unidades y guardar componentes
  API->>DB: COMMIT
  DB-->>API: Resultado completo
 end
 alt Respuesta recibida
  API-->>UI: Confirmación y referencias definitivas
  UI->>Local: Conciliar y marcar outbox confirmado
 else Timeout o corte después del commit
  UI->>Local: Mantener pendiente con el mismo UUID
  UI->>API: Reintento con el mismo UUID
  API->>DB: Consultar operación ya confirmada
  DB-->>API: Mismo resultado, sin otra venta
 end
```

## 5. Estados de cocina y cobro separados

```mermaid
stateDiagram-v2
 [*] --> Nueva
 Nueva --> Preparando: permiso de cocina
 Preparando --> Lista: preparación terminada
 Lista --> Entregada: entrega confirmada
 Nueva --> Anulada: autorización y motivo
 Preparando --> Anulada: política y reversión
 Lista --> Anulada: política y reversión
 Entregada --> [*]
 Anulada --> [*]
```

Pago es otra dimensión: pendiente -> parcial -> pagada -> devolución/contrapago.
No marcar Entregada automáticamente solo porque se cobró. No permitir retrocesos
silenciosos ni una anulación que solo cambie texto sin sus contramovimientos.

## 6. Compra y anulación objetivo

```mermaid
flowchart LR
 PROV[Proveedor activo] --> DRAFT[Compra borrador con líneas]
 DRAFT --> CHECK[Validar costos, unidades, impuestos y responsable]
 CHECK --> CONF[Confirmar una vez en transacción]
 CONF --> STOCK[Actualizar existencias y costo según política]
 STOCK --> LEDGER[Movimientos y auditoría]
 CONF --> CANCEL[Anular con motivo y permiso]
 CANCEL --> COMP[Contramovimientos y efecto de costo definido]
 COMP --> LEDGER
```

Definir cómo anular una compra si parte del stock ya fue consumida y cómo ajustar
su costo; no implementar un simple decremento que pueda dejar existencia negativa.

## 7. Modelo de relaciones objetivo (simplificado)

No sustituye el DDL. Clientes/terminales y algunos campos aún requieren diseño.
El inventario real de relaciones está en INVENTARIO_SQL.md.

```mermaid
erDiagram
 PERFILES ||--o{ ORDENES : vende
 PERFILES ||--o{ CAJA_SESIONES : opera
 CAJA_SESIONES ||--o{ ORDENES : agrupa
 CATEGORIAS ||--o{ PRODUCTOS : clasifica
 ORDENES ||--|{ ORDEN_DETALLES : contiene
 PRODUCTOS ||--o{ ORDEN_DETALLES : snapshot
 ORDENES ||--o{ PAGOS : desglosa
 ORDENES ||--o| COCINA_TICKETS : proyecta
 PRODUCTOS ||--o{ RECETAS : necesita
 INVENTARIO ||--o{ RECETAS : ingrediente
 INVENTARIO ||--o{ INVENTARIO_MOVIMIENTOS : traza
 PROVEEDORES ||--o{ COMPRAS : suministra
 COMPRAS ||--|{ COMPRA_DETALLES : contiene
 INVENTARIO ||--o{ COMPRA_DETALLES : recibe
 PERFILES ||--o{ REGISTRO_AUDITORIA : autor
```

## 8. Aceptación por escenario

| Caso | Criterio final | Situación auditada |
|---|---|---|
| E1 | Día completo, receta/caja/mixto/cocina/cierre/reportes | Solo subconjunto local conciliado |
| E2 | Compra modifica stock, costo y margen de receta vinculada | Entrada simple, sin receta vinculada |
| E3 | Anulación autorizada revierte y audita | Sin acción operativa identificada |
| E4 | Mínimo alerta y entrada retira alerta | Falla exactamente en mínimo |
| E5 | Precio nuevo conserva venta anterior | Pasa local; round-trip real pendiente |
| E6 | UI/API/RPC rechazan lo no autorizado y registran | UI restringe; repositorio local y varios permisos SQL fallan |
| E7 | Corte y reintento recuperan sin pérdida/duplicación | Local encola; sync/PWA con defectos |
| E8 | Ingredientes insuficientes aplican política sin parcialidad | Falta integración frontend; rollback RPC parcial probado en memoria |

## 9. Decisiones de negocio pendientes

- Momento del consumo: reservar al enviar, consumir al cobrar o al confirmar producción.
- Venta offline y conflictos de stock entre terminales.
- Caja requerida y propiedad por usuario/terminal.
- Numeración temporal/definitiva, requisitos fiscales y tolerancia a saltos.
- Productos sin receta, unidades y estrategia de costo.
- Descuentos, anulaciones, devoluciones y quién los autoriza.
- Servicio/propinas y canales aquí/llevar/delivery.
- Qué significa venta neta/utilidad y cómo se muestran impuestos/gastos.
- Recuperación de dispositivo y continuidad con cola sin sincronizar.

Resolver esas decisiones antes de cerrar contratos de implementación o afirmar
que la plataforma satisface el workflow completo del negocio.
