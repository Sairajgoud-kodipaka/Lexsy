import type {
  UploadResponse,
  ChatResponse,
  PreviewResponse,
  CompleteResponse,
  ErrorResponse,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

class ApiError extends Error {
  constructor(
    public status: number,
    public error: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  
  if (!response.ok) {
    if (contentType && contentType.includes('application/json')) {
      const errorData: ErrorResponse = await response.json();
      throw new ApiError(
        response.status,
        errorData.error || 'Unknown error',
        errorData.message || 'An error occurred'
      );
    }
    throw new ApiError(
      response.status,
      'Network error',
      `HTTP ${response.status}: ${response.statusText}`
    );
  }

  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response.text() as Promise<T>;
}

export const api = {
  async uploadDocument(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('document', file);

    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    return handleResponse<UploadResponse>(response);
  },

  async sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        message: message,
      }),
    });

    return handleResponse<ChatResponse>(response);
  },

  async getPreview(sessionId: string): Promise<PreviewResponse> {
    const response = await fetch(
      `${API_URL}/api/preview?session_id=${sessionId}`,
      {
        method: 'GET',
      }
    );

    return handleResponse<PreviewResponse>(response);
  },

  async completeDocument(sessionId: string): Promise<CompleteResponse> {
    const response = await fetch(`${API_URL}/api/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    });

    return handleResponse<CompleteResponse>(response);
  },

  async downloadDocument(filename: string): Promise<Blob> {
    const response = await fetch(`${API_URL}/api/download/${filename}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorData: ErrorResponse = await response.json();
      throw new ApiError(
        response.status,
        errorData.error || 'Download failed',
        errorData.message || 'Unable to download file'
      );
    }

    return response.blob();
  },

  async resetSession(sessionId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      const errorData: ErrorResponse = await response.json();
      throw new ApiError(
        response.status,
        errorData.error || 'Reset failed',
        errorData.message || 'Unable to reset session'
      );
    }
  },

  async editField(
    sessionId: string,
    fieldKey: string,
    newValue: string
  ): Promise<PreviewResponse> {
    const response = await fetch(`${API_URL}/api/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        field_key: fieldKey,
        value: newValue,
      }),
    });

    return handleResponse<PreviewResponse>(response);
  },

  async healthCheck(): Promise<{ status: string }> {
    const response = await fetch(`${API_URL}/api/health`, {
      method: 'GET',
    });

    return handleResponse<{ status: string }>(response);
  },
};

export { ApiError };

