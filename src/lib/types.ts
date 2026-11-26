export interface AcademicProfile {
  title: string;
  name: string;
  email: string;
  faculty: string;
  department: string;
}

export const displayName = (u: { title: string; name: string }) => (u.title ? `${u.title} ${u.name}` : u.name);
