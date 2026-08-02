// Fila offline de edições de checklist — v1 do plano de PWA offline-first.
//
// Escopo desta primeira fatia: só o autosave de checklist já aberto (edição
// de `dados`/header em checklists.$id.tsx), que é o ponto único usado por
// TODOS os tipos de checklist (inclui remapeamento). Criar um checklist novo
// e finalizar continuam exigindo rede — finalizar dispara geração de
// snapshot/PDF no servidor, que não tem como acontecer offline; criar exige
// um id novo do banco. Isso cobre o caso real citado: técnico já abriu o
// remapeamento (com rede) e preenche o resto da visita sem sinal.
//
// Fica só uma edição pendente POR checklist — cada novo autosave offline
// substitui a anterior (é sempre o estado mais recente que importa, não o
// histórico de edições intermediárias).

const DB_NAME = "webicheck-offline";
const DB_VERSION = 1;
const STORE = "pending_checklist_updates";

export interface PendingChecklistUpdate {
  checklistId: string;
  patch: Record<string, unknown>;
  queuedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste ambiente."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "checklistId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Falha na transação IndexedDB."));
    });
  } finally {
    db.close();
  }
}

/** Grava/atualiza a edição pendente de um checklist — substitui a anterior. */
export async function queueChecklistUpdate(
  checklistId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await withStore("readwrite", (store) =>
    store.put({ checklistId, patch, queuedAt: new Date().toISOString() }),
  );
}

/** Lê a edição pendente de um checklist (ou null se não houver). */
export async function getPendingChecklistUpdate(
  checklistId: string,
): Promise<PendingChecklistUpdate | null> {
  const result = await withStore<PendingChecklistUpdate | undefined>("readonly", (store) =>
    store.get(checklistId),
  );
  return result ?? null;
}

/** Remove a edição pendente de um checklist (depois de sincronizar). */
export async function clearPendingChecklistUpdate(checklistId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(checklistId));
}

export async function listPendingChecklistUpdates(): Promise<PendingChecklistUpdate[]> {
  return withStore<PendingChecklistUpdate[]>("readonly", (store) => store.getAll());
}

export async function countPendingChecklistUpdates(): Promise<number> {
  return withStore<number>("readonly", (store) => store.count());
}

/** TypeError é o que o fetch/supabase-js lança quando não consegue nem
 * abrir a conexão (sem rede) — diferente de um erro de validação/RLS do
 * servidor, que precisa aparecer pro técnico, não ser engolido como
 * "offline". Checar navigator.onLine primeiro evita até tentar a chamada. */
export function looksLikeNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError;
}

/** Tenta sincronizar todas as edições pendentes. Chamado ao voltar a rede
 * (evento 'online') e ao reabrir um checklist com pendência local. Silencioso
 * por padrão — erros de rede durante o próprio drain apenas mantêm a fila
 * intacta para a próxima tentativa. */
export async function drainPendingChecklistUpdates(
  applyUpdate: (checklistId: string, patch: Record<string, unknown>) => Promise<void>,
): Promise<{ synced: string[]; failed: string[] }> {
  const pending = await listPendingChecklistUpdates();
  const synced: string[] = [];
  const failed: string[] = [];
  for (const item of pending) {
    try {
      await applyUpdate(item.checklistId, item.patch);
      await clearPendingChecklistUpdate(item.checklistId);
      synced.push(item.checklistId);
    } catch (error) {
      if (looksLikeNetworkFailure(error)) {
        failed.push(item.checklistId);
        continue; // sem rede de novo — mantém na fila, tenta na próxima
      }
      // Erro real (RLS, checklist já finalizado por outra revisão etc.):
      // mantém na fila também (não descarta trabalho do técnico), mas
      // marca como falho para quem chamou decidir se avisa o usuário.
      failed.push(item.checklistId);
    }
  }
  return { synced, failed };
}
