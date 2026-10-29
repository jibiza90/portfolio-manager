import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            // La demostracion /invitado es una pagina aparte: no carga el area de clientes ni la base de datos.
            input: {
                main: 'index.html',
                invitado: 'invitado/index.html'
            }
        }
    },
    server: {
        port: 5173,
        host: true
    }
});
