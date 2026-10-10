// Shared between server.ts (which builds it from Jolpica) and the client.

export type Driver = {
  id: string;
  code: string;
  name: string;
  familyName: string;
  number: string;
  constructorId: string;
  /** On the grid for the remaining rounds (entered the most recent race). */
  active: boolean;
};

export type Constructor = {
  id: string;
  name: string;
};

export type Result = {
  driverId: string;
  constructorId: string;
  /** Classified position, or null for R/D/W/N/E. */
  position: number | null;
  points: number;
  status: string;
};

export type Race = {
  round: number;
  name: string;
  short: string;
  date: string;
  country: string;
  hasSprint: boolean;
  result?: Result[];
  sprintResult?: Result[];
};

export type Season = {
  year: number;
  fetchedAt: string;
  drivers: Driver[];
  constructors: Constructor[];
  races: Race[];
  /** Points by classified position (index 0 = P1), derived from this season's results. */
  points: { race: number[]; sprint: number[] };
  /** "previous" when no round has run yet and the grid is borrowed from the prior season. */
  gridSource: "season" | "previous";
};
