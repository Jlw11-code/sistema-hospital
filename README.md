# Sistema Hospitalario Serena

Panel web adaptable para organizar pacientes, profesionales de la salud, centros médicos y citas. Está construido con HTML, CSS y JavaScript nativo, sin dependencias ni proceso de compilación.

## Requisitos

- Un navegador web moderno.
- Un servidor web local para servir los archivos y permitir la lectura de `data.json`. Se recomienda la extensión **Live Server** de Visual Studio Code.

## Cómo ejecutar

1. Abre la carpeta del proyecto en Visual Studio Code.
2. Inicia un servidor local desde `index.html` con **Open with Live Server**.
3. Abre la dirección local que muestra Live Server en el navegador.

No abras `index.html` directamente como archivo (`file://`): los navegadores pueden bloquear la lectura de `data.json` en ese modo.

## Módulos

- **Resumen:** muestra pacientes registrados, citas del día, doctores disponibles, próximas citas y profesionales disponibles.
- **Pacientes:** permite registrar, actualizar y eliminar pacientes. Se solicitan nombre, documento, fecha de nacimiento y teléfono; el correo es opcional. El documento no puede repetirse.
- **Doctores:** permite registrar, actualizar y eliminar profesionales con su especialidad, horario de atención y estado. Los estados disponibles son libre, activo, en línea, offline y fuera de servicio.
- **Clínicas y hospitales:** permite agregar, editar y eliminar clínicas, hospitales y centros médicos, con dirección y teléfono de contacto. El correo es opcional. Se evita repetir un centro con el mismo nombre y dirección.
- **Citas:** permite reservar una consulta para un paciente y un doctor disponible. Cada cita dura 30 minutos; antes de confirmarla se comprueba el horario de atención y que no se cruce con otra cita del mismo doctor. Los cruces se bloquean y se informa al usuario.

## Datos y persistencia

`data.json` contiene los datos iniciales del sistema:

```json
{
  "doctores": [],
  "hospitales": [],
  "pacientes": [],
  "citas": []
}
```

Al iniciar por primera vez, la aplicación lee este archivo. Después, los cambios se guardan en el almacenamiento local (`localStorage`) del navegador bajo la clave `clinica-serena-data-v1`.

Esto significa que los cambios:

- permanecen en el mismo navegador y perfil después de cerrar o actualizar la página;
- no actualizan `data.json`;
- no se comparten automáticamente entre navegadores, usuarios o dispositivos.

Para volver a los datos iniciales, elimina la entrada `clinica-serena-data-v1` del almacenamiento local del sitio desde las herramientas de desarrollo del navegador y vuelve a cargar la página. Esta acción elimina los cambios guardados en ese navegador.

## Estructura del proyecto

| Archivo | Propósito |
| --- | --- |
| `index.html` | Estructura del panel y formularios de los módulos. |
| `style.css` | Estilos, componentes visuales y adaptación a pantallas móviles. |
| `app.js` | Lectura de datos, renderizado, validaciones y operaciones de alta, edición y eliminación. |
| `data.json` | Datos iniciales de doctores, clínicas u hospitales, pacientes y citas. |

## Alcance y consideraciones

Esta versión es un prototipo frontend. No incluye servidor, base de datos central, inicio de sesión, control de acceso ni sincronización entre equipos. `localStorage` no es apropiado para almacenar información clínica real o sensible en producción. Para un uso hospitalario real se requiere, como mínimo, un backend con autenticación, autorización por roles, almacenamiento seguro, validaciones del lado del servidor, respaldo y cumplimiento de la normativa de privacidad aplicable.
