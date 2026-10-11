import http from 'http';
import { WorkspaceRole } from './workspaces.js';

export interface BoardEvent {
  boardId: string;
  seq: number;
  type: string;
  entityId: string;
  timestamp: string;
  payload: any;
}

export interface BoardClient {
  id: string;
  boardId: string;
  workspaceId: string;
  userId: string;
  sessionId: string;
  role: WorkspaceRole;
  res: http.ServerResponse;
}

class BoardEventManager {
  private clients: Map<string, BoardClient> = new Map();
  private boardSeq: Map<string, number> = new Map();

  addClient(client: BoardClient): void {
    this.clients.set(client.id, client);
    client.res.on('close', () => {
      this.clients.delete(client.id);
    });
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.res.end();
      } catch (_e) {
        // ignore
      }
      this.clients.delete(clientId);
    }
  }

  broadcast(boardId: string, eventType: string, entityId: string, payload: any): void {
    const currentSeq = (this.boardSeq.get(boardId) || 0) + 1;
    this.boardSeq.set(boardId, currentSeq);

    const event: BoardEvent = {
      boardId,
      seq: currentSeq,
      type: eventType,
      entityId,
      timestamp: new Date().toISOString(),
      payload,
    };

    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const client of this.clients.values()) {
      if (client.boardId === boardId) {
        try {
          client.res.write(data);
        } catch (_err) {
          this.clients.delete(client.id);
        }
      }
    }
  }

  terminateForSession(sessionId: string): void {
    for (const [id, client] of this.clients.entries()) {
      if (client.sessionId === sessionId) {
        try {
          client.res.write(`event: error\ndata: ${JSON.stringify({ error: 'Session revoked' })}\n\n`);
          client.res.end();
        } catch (_e) {
          // Client stream already closed
        }
        this.clients.delete(id);
      }
    }
  }

  terminateForUserInWorkspace(workspaceId: string, userId: string): void {
    for (const [id, client] of this.clients.entries()) {
      if (client.workspaceId === workspaceId && client.userId === userId) {
        try {
          client.res.write(`event: error\ndata: ${JSON.stringify({ error: 'Access revoked to this workspace' })}\n\n`);
          client.res.end();
        } catch (_e) {
          // Client stream already closed
        }
        this.clients.delete(id);
      }
    }
  }

  updateRoleForUserInWorkspace(workspaceId: string, userId: string, newRole: WorkspaceRole): void {
    for (const client of this.clients.values()) {
      if (client.workspaceId === workspaceId && client.userId === userId) {
        client.role = newRole;
        try {
          client.res.write(`event: roleChange\ndata: ${JSON.stringify({ role: newRole })}\n\n`);
        } catch (_e) {
          // Client stream already closed
        }
      }
    }
  }

  getClients(): IterableIterator<BoardClient> {
    return this.clients.values();
  }
}

export const boardEventManager = new BoardEventManager();
