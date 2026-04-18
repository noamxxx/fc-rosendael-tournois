export type TournamentPublic = {
  id: string
  name: string
  slug: string
  createdAt: string
  status?: 'active' | 'archived'
  archivedAt?: string | null
  liveMatchId?: string | null
  live?: number | boolean
  registrationOpen?: number | boolean
  registrationClosedAt?: string | null
}

export type Team = {
  id: string
  name: string
  contactFirstName?: string | null
  contactLastName?: string | null
}

export type TeamPlayer = {
  id: string
  teamId: string
  firstName: string
  lastName: string
  createdAt: string
  /** Présent si le joueur vient d’une inscription (lien côté serveur). */
  registrationId?: string | null
}

export type Match = {
  id: string
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  status: 'scheduled' | 'final'
  winnerTeamId?: string | null
  round?: number | null
  slot?: number | null
  nextMatchId?: string | null
  nextSlot?: number | null
  createdAt: string
}

export type StandingRow = {
  teamId: string
  teamName: string
  played: number
  wins: number
  draws: number
  losses: number
  gf: number
  ga: number
  gd: number
  points: number
}

export type TournamentSnapshot = {
  tournament: TournamentPublic
  teams: Team[]
  players?: TeamPlayer[]
  matches: Match[]
  standings: StandingRow[]
  bracket?: {
    type: 'single_elimination'
    rounds: Array<{ round: number; matches: Match[] }>
    championTeamId: string | null
  } | null
}

export type TournamentsIndex = {
  active: TournamentPublic[]
  archived: TournamentPublic[]
  liveMode?: 'auto' | 'none' | 'slug'
}

