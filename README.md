# Punto Verde App

Crea una aplicación web móvil primero para “Restaurante Punto Verde” con pedidos por QR de mesa. Debe incluir: (1) menú cliente que lee ?mesa=5 desde la URL, encabezado Restaurante Punto Verde y estética elegante, fresca/natural; productos por categorías, carrito y confirmación. (2) Al confirmar, buscar pedido activo de esa mesa: si existe sumar los ítems y cantidades a ese pedido; si no, crear uno nuevo. (3) Vista de cocina en tiempo real de pedidos activos, con mesa e ítems, encabezado “Cocina - Restaurante Punto Verde” y botón para marcar servido/cerrado. Usa una estética moderna mobile-first con verde esmeralda, blanco y tonos tierra. Habilita backend de Lovable Cloud para persistencia y realtime. Incluye datos iniciales de menú y rutas claras para cliente y cocina.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://punto-verde-orders.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/48303e47-8606-4a84-ae7b-4d9a3b3f7ad4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
