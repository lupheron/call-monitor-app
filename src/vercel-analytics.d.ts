declare module "@vercel/analytics/next" {
  export function Analytics(props?: {
    beforeSend?: (event: unknown) => unknown;
    debug?: boolean;
    mode?: "auto" | "development" | "production";
  }): null;
}
