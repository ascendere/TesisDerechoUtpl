import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable, from, of } from 'rxjs';
import { switchMap, map, filter } from 'rxjs/operators';
import User from '../interfaces/user.interface';
import { deleteField } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  private loggedIn: Observable<boolean>;

  constructor(
    private afAuth: AngularFireAuth,
    private firestore: AngularFirestore,
  ) {
    this.loggedIn = this.afAuth.authState.pipe(map((user) => !!user));
  }

  isLoggedIn(): Observable<boolean> {
    return this.loggedIn;
  }

  getCurrentUser(): Observable<User | null> {
    return this.afAuth.authState.pipe(
      switchMap((user) => {
        if (user) {
          return this.firestore
            .collection<User>('users')
            .doc(user.uid)
            .valueChanges()
            .pipe(
              filter((userData): userData is User => userData !== undefined),
            );
        } else {
          return of(null);
        }
      }),
    );
  }

  getCurrentUserRole(): Observable<string> {
    return this.afAuth.authState.pipe(
      switchMap((user) => {
        if (user) {
          return this.firestore
            .collection('users')
            .doc(user.uid)
            .valueChanges();
        } else {
          return of(null);
        }
      }),
      switchMap((userData: any) => {
        return of(userData?.role || 'estudiante'); // Si no tiene rol, se asume estudiante
      }),
    );
  }

  getUserId(): Observable<string | null> {
    return this.afAuth.authState.pipe(map((user) => (user ? user.uid : null)));
  }

  login(email: string, password: string): Observable<any> {
    return from(this.afAuth.signInWithEmailAndPassword(email, password));
  }

  logout(): Observable<void> {
    return from(this.afAuth.signOut());
  }
}
