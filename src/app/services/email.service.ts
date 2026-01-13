import { Injectable } from '@angular/core';
import { AngularFireFunctions } from '@angular/fire/compat/functions';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class EmailService {
  constructor(private functions: AngularFireFunctions) {}

  // Enviar correo con archivo adjunto
  async sendEmailWithAttachment(to: string, file: File): Promise<any> {
    // Convertir el archivo a Base64
    const base64Content = await this.fileToBase64(file);

    const callable = this.functions.httpsCallable('sendEmail');

    // Enviamos el contenido, el nombre y el tipo de archivo
    return callable({
      to,
      attachment: base64Content,
      fileName: file.name,
      contentType: file.type,
    }).toPromise();
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Quitamos el prefijo "data:application/pdf;base64,"
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  }

  // Enviar correo simple
  sendEmail(to: string, text: string) {
    const callable = this.functions.httpsCallable('sendEmail');
    return callable({ to, text }).toPromise(); // httpsCallable gestiona CORS automáticamente
  }
}
