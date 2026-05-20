import type { ApiErrorBody } from "./types.js";
import { EmitWaveError, createErrorFromResponse } from "./errors.js";
import { toSnakeCase, toCamelCase } from "./utils.js";

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class HttpClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-Emitwave-SDK": "js/0.1.0",
      },
      body: JSON.stringify(toSnakeCase(body)),
    });

    return this.handleResponse<T>(response);
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        searchParams.set(key, String(value));
      }
      url += `?${searchParams.toString()}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Emitwave-SDK": "js/0.1.0",
      },
    });

    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let body: ApiErrorBody;
      try {
        body = await response.json();
      } catch {
        throw new EmitWaveError(
          `HTTP ${response.status}: ${response.statusText}`,
          "HTTP_ERROR",
          response.status,
        );
      }
      throw createErrorFromResponse(response.status, body);
    }

    const json = await response.json();
    return toCamelCase(json) as T;
  }
}
