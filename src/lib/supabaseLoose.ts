export type SupabaseLooseError = { message?: string; code?: string } | null;

export type SupabaseLooseResponse = {
  data: unknown;
  error: SupabaseLooseError;
};

export type SupabaseLooseQuery = PromiseLike<SupabaseLooseResponse> & {
  select: (...args: unknown[]) => SupabaseLooseQuery;
  insert: (...args: unknown[]) => SupabaseLooseQuery;
  update: (...args: unknown[]) => SupabaseLooseQuery;
  upsert: (...args: unknown[]) => SupabaseLooseQuery;
  delete: (...args: unknown[]) => SupabaseLooseQuery;
  eq: (...args: unknown[]) => SupabaseLooseQuery;
  in: (...args: unknown[]) => SupabaseLooseQuery;
  order: (...args: unknown[]) => SupabaseLooseQuery;
  limit: (...args: unknown[]) => SupabaseLooseQuery;
  maybeSingle: (...args: unknown[]) => SupabaseLooseQuery;
  single: (...args: unknown[]) => SupabaseLooseQuery;
};

export type SupabaseLooseClient = {
  from: (table: string) => SupabaseLooseQuery;
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<SupabaseLooseResponse>;
};

export function asSupabaseLooseClient(client: unknown) {
  return client as SupabaseLooseClient;
}
