import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';

interface ImportRow {
  email?: string;
  firstName?: string;
  lastName?: string;
  nombre?: string;
  apellido?: string;
  cedula?: string;
  role?: string;
  subject?: string;
  parallel?: string;
  [key: string]: any;
}

interface AuthorizedSaveIssue {
  row?: number;
  email: string;
  cedula?: string;
  reason:
    | 'duplicate_email'
    | 'duplicate_cedula'
    | 'duplicate_in_file_email'
    | 'duplicate_in_file_cedula'
    | 'missing_required_fields';
}

interface AuthorizedSaveReport {
  created: number;
  reactivated: number;
  skipped: AuthorizedSaveIssue[];
}

@Injectable({ providedIn: 'root' })
export class ImportService {
  constructor(
    private afs: AngularFirestore,
    private afAuth: AngularFireAuth,
  ) {}

  async saveUsersToAuthorized(users: any[]): Promise<AuthorizedSaveReport> {
    return await this.upsertAuthorizedUsers(users);
  }

  private normalizeEmail(value: any): string {
    return `${value || ''}`.toLowerCase().trim();
  }

  private normalizeCedula(value: any): string {
    return `${value || ''}`.trim();
  }

  private buildAuthorizedPayload(
    user: any,
    status: 'registered' | 'no registered' = 'no registered',
  ): any {
    const payload: any = {
      email: this.normalizeEmail(user.email),
      firstName: `${user.firstName || ''}`.trim(),
      lastName: `${user.lastName || ''}`.trim(),
      cedula: this.normalizeCedula(user.cedula) || null,
      role: `${user.role || ''}`.trim(),
      degree: user.degree ? `${user.degree}`.trim() : null,
      tempData: user.tempData || null,
      pendingData: user.pendingData || user.tempData || null,
      isActive: true,
      isPPL: user?.isPPL === true,
      status,
      updatedAt: new Date(),
    };

    if (!payload.tempData) {
      delete payload.tempData;
      delete payload.pendingData;
    }

    return payload;
  }

  private isInactiveAuthorizedRecord(data: any): boolean {
    return data?.isActive === false || data?.status === 'disabled';
  }

  private isRegisteredStatus(value: any): boolean {
    return `${value || ''}`.toLowerCase().trim() === 'registered';
  }

  private buildReactivationPayload(
    user: any,
    existingRecord: any,
    status: 'registered' | 'no registered',
  ): any {
    const payload: any = {
      isActive: true,
      isPPL: user?.isPPL === true,
      status,
      updatedAt: new Date(),
    };

    const firstName = `${user?.firstName || ''}`.trim();
    const lastName = `${user?.lastName || ''}`.trim();
    const cedula = this.normalizeCedula(user?.cedula);
    const role = `${user?.role || ''}`.trim();

    if (!`${existingRecord?.firstName || ''}`.trim() && firstName) {
      payload.firstName = firstName;
    }

    if (!`${existingRecord?.lastName || ''}`.trim() && lastName) {
      payload.lastName = lastName;
    }

    if (!this.normalizeCedula(existingRecord?.cedula) && cedula) {
      payload.cedula = cedula;
    }

    if (!`${existingRecord?.role || ''}`.trim() && role) {
      payload.role = role;
    }

    return payload;
  }

  private async hasRegisteredUserByEmail(email: string): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail) {
      return false;
    }

    const snapshot = await firstValueFrom(
      this.afs
        .collection('users', (ref) =>
          ref.where('email', '==', normalizedEmail).limit(1),
        )
        .get(),
    );

    return snapshot.docs.length > 0;
  }

  private async getAuthorizedByEmail(email: string): Promise<any | null> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail) {
      return null;
    }

    const snapshot = await firstValueFrom(
      this.afs.collection('authorized').doc(normalizedEmail).get(),
    );

    if (!snapshot.exists) {
      return null;
    }

    return {
      id: snapshot.id,
      ...(snapshot.data() as any),
    };
  }

  private async getAuthorizedByCedula(cedula: string): Promise<any | null> {
    const normalizedCedula = this.normalizeCedula(cedula);

    if (!normalizedCedula) {
      return null;
    }

    const snapshot = await firstValueFrom(
      this.afs
        .collection('authorized', (ref) =>
          ref.where('cedula', '==', normalizedCedula).limit(1),
        )
        .get(),
    );

    if (!snapshot.docs.length) {
      return null;
    }

    const doc = snapshot.docs[0];

    return {
      id: doc.id,
      ...(doc.data() as any),
    };
  }

  private async upsertAuthorizedUsers(
    users: any[],
  ): Promise<AuthorizedSaveReport> {
    const report: AuthorizedSaveReport = {
      created: 0,
      reactivated: 0,
      skipped: [],
    };

    const normalizedUsers = (users || []).map((user) => ({
      ...user,
      email: this.normalizeEmail(user.email),
      cedula: this.normalizeCedula(user.cedula),
    }));

    const uniqueEmails = Array.from(
      new Set(normalizedUsers.map((user) => user.email).filter(Boolean)),
    );
    const uniqueCedulas = Array.from(
      new Set(normalizedUsers.map((user) => user.cedula).filter(Boolean)),
    );

    const existingByEmail = new Map<string, any | null>();
    await Promise.all(
      uniqueEmails.map(async (email) => {
        existingByEmail.set(email, await this.getAuthorizedByEmail(email));
      }),
    );

    const existingByCedula = new Map<string, any | null>();
    await Promise.all(
      uniqueCedulas.map(async (cedula) => {
        existingByCedula.set(cedula, await this.getAuthorizedByCedula(cedula));
      }),
    );

    const hasRegisteredUserByEmail = new Map<string, boolean>();
    await Promise.all(
      uniqueEmails.map(async (email) => {
        hasRegisteredUserByEmail.set(
          email,
          await this.hasRegisteredUserByEmail(email),
        );
      }),
    );

    const seenEmails = new Set<string>();
    const seenCedulas = new Set<string>();
    const activatedEmails = new Set<string>();
    const batch = this.afs.firestore.batch();
    let hasWrites = false;

    for (const user of normalizedUsers) {
      const email = user.email;
      const cedula = user.cedula;
      const row = user.sourceRow ? Number(user.sourceRow) : undefined;

      if (!email || !cedula || !user.firstName || !user.lastName) {
        report.skipped.push({
          row,
          email: email || 'sin-correo',
          cedula: cedula || undefined,
          reason: 'missing_required_fields',
        });
        continue;
      }

      if (seenEmails.has(email)) {
        report.skipped.push({
          row,
          email,
          cedula,
          reason: 'duplicate_in_file_email',
        });
        continue;
      }

      if (seenCedulas.has(cedula)) {
        report.skipped.push({
          row,
          email,
          cedula,
          reason: 'duplicate_in_file_cedula',
        });
        continue;
      }

      seenEmails.add(email);
      seenCedulas.add(cedula);

      const existingByEmailRecord = existingByEmail.get(email) || null;
      const existingByCedulaRecord = existingByCedula.get(cedula) || null;
      const alreadyRegisteredInUsers =
        hasRegisteredUserByEmail.get(email) === true;

      if (existingByEmailRecord) {
        if (this.isInactiveAuthorizedRecord(existingByEmailRecord)) {
          const reactivationStatus: 'registered' | 'no registered' =
            this.isRegisteredStatus(existingByEmailRecord.status) ||
            alreadyRegisteredInUsers
              ? 'registered'
              : 'no registered';

          batch.set(
            this.afs.collection('authorized').doc(email).ref,
            this.buildReactivationPayload(
              user,
              existingByEmailRecord,
              reactivationStatus,
            ),
            { merge: true },
          );
          activatedEmails.add(email);
          report.reactivated += 1;
          hasWrites = true;
          continue;
        }

        report.skipped.push({
          row,
          email,
          cedula,
          reason: 'duplicate_email',
        });
        continue;
      }

      if (
        existingByCedulaRecord &&
        this.normalizeEmail(existingByCedulaRecord.email) !== email
      ) {
        report.skipped.push({
          row,
          email,
          cedula,
          reason: 'duplicate_cedula',
        });
        continue;
      }

      batch.set(
        this.afs.collection('authorized').doc(email).ref,
        this.buildAuthorizedPayload(
          user,
          alreadyRegisteredInUsers ? 'registered' : 'no registered',
        ),
      );
      activatedEmails.add(email);
      report.created += 1;
      hasWrites = true;
    }

    if (hasWrites) {
      await batch.commit();
    }

    if (activatedEmails.size) {
      await this.syncUsersActivation(Array.from(activatedEmails), true);
    }

    return report;
  }

  private async syncUsersActivation(
    emails: string[],
    isActive: boolean,
  ): Promise<void> {
    const normalizedEmails = Array.from(
      new Set(
        (emails || [])
          .map((email) => this.normalizeEmail(email))
          .filter(Boolean),
      ),
    );

    if (!normalizedEmails.length) {
      return;
    }

    const userDocsByEmail = await Promise.all(
      normalizedEmails.map(async (email) => {
        const snapshot = await firstValueFrom(
          this.afs
            .collection('users', (ref) => ref.where('email', '==', email))
            .get(),
        );

        return snapshot.docs;
      }),
    );

    const batch = this.afs.firestore.batch();
    let hasUserWrites = false;

    userDocsByEmail.forEach((docs) => {
      docs.forEach((doc) => {
        batch.set(
          doc.ref,
          {
            isActive,
            updatedAt: new Date(),
          },
          { merge: true },
        );
        hasUserWrites = true;
      });
    });

    if (hasUserWrites) {
      await batch.commit();
    }
  }

  /* ======================================================
     1. GUARDA USUARIOS AUTORIZADOS (ACCESO)
     ====================================================== */
  async saveAuthorizedUsers(users: ImportRow[]): Promise<void> {
    await this.upsertAuthorizedUsers(
      users.map((u) => ({
        email: u.email,
        firstName: `${u.firstName || u.nombre || ''}`.trim(),
        lastName: `${u.lastName || u.apellido || ''}`.trim(),
        cedula: u.cedula,
        role: u.role,
      })),
    );
  }

  async importTeachersAuthorized(payload: any[]): Promise<void> {
    await this.upsertAuthorizedUsers(
      payload.map((row) => ({
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        cedula: row.cedula,
        role: row.role,
        degree: row.titulo,
        tempData:
          row.role === 'docente'
            ? {
                subjectName: row.subjectName,
                parallel: row.parallel,
                modality: row.modality,
                cycleId: row.cycleId,
              }
            : null,
      })),
    );
  }
}
