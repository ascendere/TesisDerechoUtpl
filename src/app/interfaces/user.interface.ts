export default interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  currentLoad?: number;
}
