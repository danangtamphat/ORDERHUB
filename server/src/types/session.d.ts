import 'express-session';
declare module 'express-session' {
  interface SessionData {
    user?: { id: string; username: string; displayName: string; role: 'admin'|'manager'|'staff'; mustChangePassword: boolean };
  }
}
