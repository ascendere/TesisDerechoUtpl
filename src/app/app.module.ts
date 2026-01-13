import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import { environment } from '../environments/environment';
import { AppComponent } from './app.component';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { HomeComponent } from './components/home/home.component';
import { RouterModule, RouterOutlet, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InfoComponent } from './components/info/info.component';
import { ProfileComponent } from './components/profile/profile.component';
import { PersonalDataComponent } from './components/personal-data/personal-data.component';
import { BarComponent } from './components/bar/bar.component';
import { DocumentosComponent } from './components/documentos/documentos.component';
import { Footer2Component } from './components/footer2/footer2.component';

import { TextComponent } from './text/text.component';
import { AdminDataComponent } from './components/admin-data/admin-data.component';
import {
  AngularFireFunctionsModule,
  ORIGIN,
} from '@angular/fire/compat/functions';
import { CicloComponent } from './components/ciclo/ciclo.component';
import { FlujoComponent } from './components/flujo/flujo.component';
import { HeadingComponent } from './components/heading/heading.component';
import { RubricaComponent } from './components/rubrica/rubrica.component';
import { AuthGuard } from './guards/auth.guard';
import { AlertaComponent } from './components/alerta/alerta.component';

const appRoutes: Routes = [
  { path: 'home', component: HomeComponent },
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'info', component: InfoComponent, canActivate: [AuthGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard] },
  {
    path: 'personal',
    component: PersonalDataComponent,
    canActivate: [AuthGuard],
  },
  { path: 'docs', component: DocumentosComponent, canActivate: [AuthGuard] },
  { path: 'data', component: AdminDataComponent, canActivate: [AuthGuard] },
  { path: 'ciclo', component: CicloComponent, canActivate: [AuthGuard] },
  { path: 'flujo', component: FlujoComponent, canActivate: [AuthGuard] },
  { path: 'rubrica', component: RubricaComponent, canActivate: [AuthGuard] },
];

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    FooterComponent,
    HomeComponent,
    LoginComponent,
    InfoComponent,
    ProfileComponent,
    PersonalDataComponent,
    BarComponent,
    DocumentosComponent,
    Footer2Component,
    TextComponent,
    AdminDataComponent,
    CicloComponent,
    FlujoComponent,
    HeadingComponent,
    RubricaComponent,
    AlertaComponent,
  ],
  imports: [
    BrowserModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAuthModule,
    AngularFirestoreModule,
    RouterOutlet,
    RouterModule.forRoot(appRoutes),
    FormsModule,
    AngularFireFunctionsModule,
  ],
  providers: [
    {
      provide: ORIGIN,
      useFactory: () => {
        if (location.hostname === 'localhost') {
          return 'http://127.0.0.1:5001/tesisderechoutpl/us-central1'; // Puerto del emulador de funciones
        }
        return null; // En producción usa la URL real automáticamente
      },
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
