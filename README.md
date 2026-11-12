GesTech - Sistema de gestión de servicio técnico e instalación de cámaras
=========================================================================

Cómo ejecutar el sistema en una computadora con Windows.


1) REQUISITO: instalar Node.js (una sola vez)
---------------------------------------------
Descargar e instalar la versión "LTS" desde https://nodejs.org
(siguiente, siguiente, finalizar; no hace falta cambiar ninguna opción).


2) ABRIR UNA TERMINAL EN ESTA CARPETA
-------------------------------------
- Descomprimir el .zip.
- Abrir la carpeta "GesTech" (la que contiene este archivo LEEME.txt).
- Hacer clic en la barra de direcciones del Explorador de archivos,
  escribir  cmd  y presionar Enter. Se abre una ventana negra (la terminal).


3) INSTALAR Y CARGAR LOS DATOS DE PRUEBA (una sola vez)
-------------------------------------------------------
En la terminal, escribir estos dos comandos (Enter después de cada uno):

    npm install
    npm run db:demo

El primero descarga las librerías del sistema: tarda 1 o 2 minutos y
necesita conexión a internet. El segundo crea la base de datos con
usuarios, clientes, productos y órdenes de trabajo de ejemplo.


4) INICIAR EL SISTEMA
---------------------
En la misma terminal:

    npm run dev

Cuando aparezca la línea  "Local: http://localhost:5173/" , abrir esa
dirección en el navegador (Chrome, Edge o Firefox).

La terminal debe quedar abierta mientras se usa el sistema.
Para cerrarlo: presionar Ctrl + C en la terminal.

Las próximas veces alcanza con abrir la terminal en la carpeta (paso 2)
y escribir  npm run dev .


USUARIOS DE PRUEBA
------------------
    Usuario     Contraseña   Rol
    admin       Admin123     Administrador
    marcelo     Marcelo1     Técnico
    gaston      Gaston12     Técnico
    mauro       Mauro123     Técnico dado de baja (no puede ingresar;
                             sirve para comprobar la baja lógica)


VOLVER A LOS DATOS DE PRUEBA ORIGINALES
---------------------------------------
En cualquier momento se pueden borrar los cambios realizados y volver a
los datos de ejemplo. Abrir otra terminal en la carpeta y escribir:

    npm run db:demo

Luego recargar la página en el navegador (si pide, volver a iniciar
sesión). Las fechas de los datos se calculan a partir del día en que se
ejecuta el comando, por lo que alertas y plazos siempre quedan vigentes.


SI ALGO NO FUNCIONA
-------------------
- "npm no se reconoce como un comando": Node.js no está instalado, o la
  terminal se abrió antes de instalarlo. Cerrarla y abrir una nueva.
- "Port 5173 is in use": el sistema ya está abierto en otra terminal.
  Usar esa, o cerrarla con Ctrl + C y volver a ejecutar  npm run dev .


Código fuente también disponible en: https://github.com/duka34/gestech
