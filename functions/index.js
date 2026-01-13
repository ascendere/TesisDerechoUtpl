/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");
// Configuración de nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "jmregaladov@gmail.com",
    pass: "theflash",
  },
});
exports.sendEmail = onCall(
  { cors: true, region: "us-central1", invoker: "public" },
  async (request) => {
    const data = request.data;

    // 1. Validar que al menos haya un destinatario
    if (!data.to) {
      throw new HttpsError(
        "invalid-argument",
        "El destinatario (to) es obligatorio."
      );
    }

    const mailOptions = {
      from: "jmrgaladov@gmail.com",
      to: data.to,
      subject: data.subject || "Notificación de Trabajo de Titulación",
      text:
        data.text ||
        "Se adjunta el documento correspondiente al proceso administrativo de titulación.",
      attachments: [], // Inicializamos vacío
    };

    // Solo agregar adjunto si el contenido existe
    if (data.attachment) {
      mailOptions.attachments.push({
        filename: data.fileName || "documento.pdf",
        content: data.attachment,
        encoding: "base64",
        contentType: data.contentType || "application/pdf",
      });
    }

    try {
      await transporter.sendMail(mailOptions);
      return { message: "Correo enviado con éxito" };
    } catch (error) {
      // Loguear el error para depuración en la consola de Firebase
      console.error("Error en Nodemailer:", error);
      throw new HttpsError(
        "internal",
        "No se pudo enviar el correo: " + error.message
      );
    }
  }
);

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
