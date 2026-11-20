"use client";

import { Menu, SquarePen } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import { ChatDrawer, ChatSidebar } from "@/components/chat/chat-sidebar";
import {
  AssistantTurn,
  LiveTurn,
  UserBubble,
} from "@/components/chat/messages";
import {
  PanelSplitter,
  panelMax,
  usePanelWidth,
} from "@/components/chat/resizable-panel";
import { ExampleQuestions } from "@/components/home-sections";
import { Logo } from "@/components/logo";
import { QuestionBox } from "@/components/question-box";
import { SourcePanel } from "@/components/source-panel";
import { newChatId, useChats } from "@/lib/chats";
import type { AskBody } from "@/lib/sse";
import { useAsk, type FinishedAnswer } from "@/lib/use-ask";
import { useMediaQuery, useViewportWidth } from "@/lib/use-media-query";

type ActiveCite = { turn: number; label: number } | null;

export function ChatApp() {
  const router = useRouter();
  const params = useSearchParams();
  const chatId = params.get("c");
  const seed = (params.get("q") ?? "").trim();
  const seedMode: AskBody["mode"] =
    params.get("mode") === "agentic" ? "agentic" : "standard";

  const chats = useChats();
  const chat = chatId
    ? (chats.items.find((c) => c.id === chatId) ?? null)
    : null;
  const turns = chat?.turns ?? [];

  // the conversation a running request belongs to (so finishing appends to the right one)
  const liveChat = useRef<string | null>(null);
  const onFinished = useCallback(
    (a: FinishedAnswer) => {
      if (liveChat.current) chats.append(liveChat.current, a);
    },
    [chats],
  );
  const { state, partial, run, cancel } = useAsk(onFinished);

  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<AskBody["mode"]>("standard");
  const [active, setActive] = useState<ActiveCite>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelWidth, setPanelWidth] = usePanelWidth();
  const viewportWidth = useViewportWidth();
  const wide = useMediaQuery("(min-width: 1280px)");
  const sidebarVisible = useMediaQuery("(min-width: 1024px)");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seeded = useRef("");

  const submit = (question: string, m: AskBody["mode"]) => {
    const q = question.trim();
    if (q.length < 3) return;
    const id = chat?.id ?? newChatId();
    liveChat.current = id;
    if (!chat) {
      chats.create(id, q);
      router.replace(`/?c=${id}`);
    }
    setDraft("");
    setActive(null);
    setSheetOpen(false);
    void run(q, m);
  };

  const startSeed = useEffectEvent((q: string, m: AskBody["mode"]) =>
    submit(q, m),
  );

  // A link such as /?q=...&mode=... (old /tanya links) starts a new conversation once.
  useEffect(() => {
    if (chatId || seed.length < 3) return;
    const key = `${seedMode}|${seed}`;
    if (seeded.current === key) return;
    seeded.current = key;
    startSeed(seed, seedMode);
  }, [chatId, seed, seedMode]);

  // Switching to another conversation while an answer is being produced stops that request.
  const prevChat = useRef(chatId);
  useEffect(() => {
    if (prevChat.current === chatId) return;
    prevChat.current = chatId;
    if (liveChat.current !== chatId) {
      cancel();
      setActive(null);
      setSheetOpen(false);
    }
  }, [chatId, cancel]);

  const live = state.status === "loading" || state.status === "error";

  // Keep the newest content in view, unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (turns.length === 0 && !live) return; // the welcome screen always starts at the top
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom || (state.status === "loading" && partial === "")) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns.length, partial, state.status, live]);

  const go = (path: string) => {
    setDrawerOpen(false);
    router.push(path);
  };
  const newChat = () => {
    liveChat.current = null;
    cancel();
    setDraft("");
    setDrawerOpen(false);
    router.push("/");
    inputRef.current?.focus();
  };
  const removeChat = (id: string) => {
    chats.remove(id);
    if (id === chatId) newChat();
  };

  const select = (turn: number, label: number) => {
    setActive({ turn, label });
    if (!wide) setSheetOpen(true);
  };
  const activeCitation =
    active !== null
      ? (turns[active.turn]?.citations.find((c) => c.label === active.label) ??
        null)
      : null;

  const empty = turns.length === 0 && !live;
  const busy = state.status === "loading";

  const composer = (
    <QuestionBox
      large={empty}
      inputRef={inputRef}
      value={draft}
      onChange={setDraft}
      onSubmit={() => submit(draft, mode)}
      mode={mode}
      onModeChange={setMode}
      busy={busy}
    />
  );

  const sidebar = (
    <ChatSidebar
      chats={chats.items}
      activeId={chat?.id ?? null}
      onNew={newChat}
      onSelect={(id) => go(`/?c=${id}`)}
      onDelete={removeChat}
    />
  );

  return (
    <div className="flex h-dvh min-h-0 w-full">
      <aside
        aria-label="Menu percakapan"
        data-testid="chat-sidebar"
        className="hidden w-[290px] shrink-0 border-r border-line bg-surface lg:block"
      >
        {sidebarVisible ? sidebar : null}
      </aside>
      {!sidebarVisible ? (
        <ChatDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          {sidebar}
        </ChatDrawer>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-3 lg:hidden">
          <button
            type="button"
            aria-label="Buka menu percakapan"
            data-testid="open-chat-menu"
            onClick={() => setDrawerOpen(true)}
            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-surface-2"
          >
            <Menu aria-hidden="true" />
          </button>
          <Logo />
          <button
            type="button"
            aria-label="Percakapan baru"
            onClick={newChat}
            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-surface-2"
          >
            <SquarePen aria-hidden="true" />
          </button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {empty ? (
            <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col items-center justify-center gap-5 px-5 py-8 sm:py-10">
              <span
                aria-hidden="true"
                className="flex size-14 items-center justify-center rounded-xl bg-brand text-brand-ink [@media(max-height:760px)]:hidden"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
                </svg>
              </span>
              <h1 className="m-0 text-balance text-center font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Tanya aturan K3 listrik, lengkap dengan pasalnya
              </h1>
              <p className="m-0 max-w-[560px] text-center text-base leading-relaxed text-ink-muted">
                Jawaban hanya dari dokumen resmi ketenagalistrikan. Setiap klaim
                menunjuk pasal dan halaman yang bisa Anda cek langsung di PDF.
              </p>
              {composer}
              <ExampleQuestions
                onPick={(q) => {
                  setDraft(q); // fill and focus so it can be edited before sending
                  inputRef.current?.focus();
                }}
              />
            </div>
          ) : (
            <div
              data-testid="conversation"
              className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 py-8 sm:px-6"
            >
              <h1 className="sr-only">Percakapan</h1>
              {turns.map((t, i) => (
                <div key={i} className="flex flex-col gap-6">
                  <UserBubble text={t.question} mode={t.mode} />
                  <AssistantTurn
                    turn={t}
                    activeLabel={active?.turn === i ? active.label : null}
                    onSelect={(label) => select(i, label)}
                  />
                </div>
              ))}
              {state.status === "loading" || state.status === "error" ? (
                <div className="flex flex-col gap-6">
                  <UserBubble text={state.question} mode={state.mode} />
                  <LiveTurn
                    mode={state.mode}
                    partial={partial}
                    steps={state.status === "loading" ? state.steps : []}
                    error={
                      state.status === "error"
                        ? {
                            message: state.message,
                            httpStatus: state.httpStatus,
                          }
                        : null
                    }
                    onRetry={() => submit(state.question, state.mode)}
                    onSelect={() => undefined}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>

        {!empty ? (
          <div className="shrink-0 bg-gradient-to-t from-ground via-ground to-transparent px-4 pb-3 pt-4 sm:px-6">
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-2">
              {composer}
              <p className="m-0 text-center text-[13px] leading-snug text-ink-muted">
                Tiap pertanyaan dijawab mandiri; K2-RAG belum mengingat
                pertanyaan sebelumnya. Bukan pengganti petugas K3. Selalu cek
                pasal sumber.
              </p>
            </div>
          </div>
        ) : (
          <p className="m-0 shrink-0 px-4 pb-3 text-center text-[13px] leading-snug text-ink-muted">
            Bukan pengganti petugas K3. Selalu cek pasal sumber.
          </p>
        )}
      </main>

      {wide && activeCitation ? (
        <>
          <PanelSplitter
            width={panelWidth}
            max={panelMax(viewportWidth)}
            onChange={setPanelWidth}
          />
          <aside
            aria-label="Panel sumber"
            style={{ width: Math.min(panelWidth, panelMax(viewportWidth)) }}
            className="hidden h-dvh shrink-0 flex-col overflow-hidden bg-surface xl:flex"
          >
            <SourcePanel
              fill
              citation={activeCitation}
              onClose={() => setActive(null)}
            />
          </aside>
        </>
      ) : null}
      {!wide ? (
        <BottomSheet
          open={sheetOpen && activeCitation !== null}
          onClose={() => setSheetOpen(false)}
          label="Panel sumber"
        >
          <SourcePanel
            citation={activeCitation}
            onClose={() => setSheetOpen(false)}
          />
        </BottomSheet>
      ) : null}
    </div>
  );
}
