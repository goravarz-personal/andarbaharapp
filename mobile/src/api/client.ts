import type {
  Dashboard,
  ExpenseInput,
  Game,
  GamePlayerInput,
  GameSummary,
  HistoryRow,
  LeaderboardRow,
  Player,
  PlayerStats,
  Role,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Field name to message, for form validation errors. */
  readonly fields?: Record<string, string>;

  constructor(status: number, message: string, code = 'error', fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** Talks to one AadarBahar server as one signed-in person. */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | null = null,
  ) {}

  withToken(token: string | null): ApiClient {
    return new ApiClient(this.baseUrl, token);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch {
      throw new ApiError(
        0,
        `Could not reach the server at ${this.baseUrl}. Check it is running and that your phone is on the same network.`,
        'network_error',
      );
    }

    const text = await response.text();
    const payload: unknown = text ? safeJson(text) : null;

    if (!response.ok) {
      const error = (payload as { error?: { message?: string; code?: string; details?: unknown } } | null)?.error;
      throw new ApiError(
        response.status,
        error?.message ?? `Request failed (${response.status}).`,
        error?.code ?? 'error',
        isFieldMap(error?.details) ? error.details : undefined,
      );
    }

    return payload as T;
  }

  // --- auth ---------------------------------------------------------------

  login(username: string, password: string) {
    return this.request<{ token: string; user: Player }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  me() {
    return this.request<{ user: Player; stats: PlayerStats }>('/auth/me');
  }

  updateMe(body: { displayName?: string; email?: string; phone?: string }) {
    return this.request<{ user: Player }>('/auth/me', { method: 'PATCH', body });
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ user: Player; token: string }>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  }

  health() {
    return this.request<{ ok: boolean; currency: string }>('/health');
  }

  // --- dashboard ----------------------------------------------------------

  dashboard() {
    return this.request<Dashboard>('/dashboard');
  }

  // --- players ------------------------------------------------------------

  players(includeInactive = false) {
    return this.request<{ players: Player[] }>(
      `/players${includeInactive ? '?includeInactive=true' : ''}`,
    );
  }

  leaderboard() {
    return this.request<{ leaderboard: LeaderboardRow[] }>('/players/leaderboard');
  }

  player(id: string) {
    return this.request<{ player: Player; stats: PlayerStats; history: HistoryRow[] }>(
      `/players/${id}`,
    );
  }

  createPlayer(body: {
    username: string;
    displayName: string;
    email?: string;
    phone?: string;
    password?: string;
    role?: Role;
  }) {
    return this.request<{ player: Player; temporaryPassword: string | null }>('/players', {
      method: 'POST',
      body,
    });
  }

  updatePlayer(
    id: string,
    body: { displayName?: string; email?: string; phone?: string; role?: Role; isActive?: boolean },
  ) {
    return this.request<{ player: Player }>(`/players/${id}`, { method: 'PATCH', body });
  }

  resetPlayerPassword(id: string, newPassword?: string) {
    return this.request<{ player: Player; password: string }>(`/players/${id}/reset-password`, {
      method: 'POST',
      body: newPassword ? { newPassword } : {},
    });
  }

  deletePlayer(id: string) {
    return this.request<{ deleted?: boolean; deactivated?: boolean; message?: string }>(
      `/players/${id}`,
      { method: 'DELETE' },
    );
  }

  // --- games --------------------------------------------------------------

  games(params: { playerId?: string } = {}) {
    const suffix = params.playerId ? `?playerId=${encodeURIComponent(params.playerId)}` : '';
    return this.request<{ games: GameSummary[] }>(`/games${suffix}`);
  }

  game(id: string) {
    return this.request<{ game: Game }>(`/games/${id}`);
  }

  createGame(body: {
    playedOn: string;
    title?: string;
    location?: string;
    notes?: string;
    players?: GamePlayerInput[];
    expenses?: ExpenseInput[];
  }) {
    return this.request<{ game: Game }>('/games', { method: 'POST', body });
  }

  updateGame(
    id: string,
    body: { playedOn?: string; title?: string; location?: string; notes?: string },
  ) {
    return this.request<{ game: Game }>(`/games/${id}`, { method: 'PATCH', body });
  }

  deleteGame(id: string) {
    return this.request<{ deleted: boolean }>(`/games/${id}`, { method: 'DELETE' });
  }

  upsertGamePlayer(gameId: string, body: GamePlayerInput) {
    return this.request<{ game: Game }>(`/games/${gameId}/players`, { method: 'POST', body });
  }

  updateGamePlayer(
    gameId: string,
    seatId: string,
    body: { buyIn?: number; cashOut?: number; isWinner?: boolean; notes?: string },
  ) {
    return this.request<{ game: Game }>(`/games/${gameId}/players/${seatId}`, {
      method: 'PATCH',
      body,
    });
  }

  removeGamePlayer(gameId: string, seatId: string) {
    return this.request<{ game: Game }>(`/games/${gameId}/players/${seatId}`, { method: 'DELETE' });
  }

  addExpense(gameId: string, body: ExpenseInput) {
    return this.request<{ game: Game }>(`/games/${gameId}/expenses`, { method: 'POST', body });
  }

  deleteExpense(gameId: string, expenseId: string) {
    return this.request<{ game: Game }>(`/games/${gameId}/expenses/${expenseId}`, {
      method: 'DELETE',
    });
  }

}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isFieldMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}
