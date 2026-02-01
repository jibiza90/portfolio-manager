export interface ClientProfile {
  id: string;
  name: string;
}

export const CLIENTS: ClientProfile[] = Array.from({ length: 100 }, (_, index) => {
  const padded = String(index + 1).padStart(3, '0');
  return {
    id: `client-${padded}`,
    name: `Cliente ${padded}`
  };
});
