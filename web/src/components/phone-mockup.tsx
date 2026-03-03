import { cn } from "@/lib/utils";

interface PhoneMockupProps {
  readonly variant: "briefing" | "nudge";
  readonly className?: string;
}

interface ChatBubble {
  readonly sender: "alma" | "user";
  readonly text: string;
  readonly time: string;
}

const BRIEFING_MESSAGES: readonly ChatBubble[] = [
  {
    sender: "alma",
    text: "Buenos dias! Tu briefing de hoy:",
    time: "7:30 AM",
  },
  {
    sender: "alma",
    text: "Hoy tienes reunion de padres a las 3 PM. El filtro del aire acondicionado lleva 87 dias -- te recomiendo cambiarlo esta semana. Y el plomero confirmo para el sabado a las 10 AM.",
    time: "7:30 AM",
  },
  {
    sender: "user",
    text: "Perfecto, gracias Alma!",
    time: "7:32 AM",
  },
  {
    sender: "alma",
    text: "De nada! Que tengas un excelente dia.",
    time: "7:32 AM",
  },
] as const;

const NUDGE_MESSAGES: readonly ChatBubble[] = [
  {
    sender: "alma",
    text: "Hola! Un recordatorio gentil de parte de Maria:",
    time: "6:15 PM",
  },
  {
    sender: "alma",
    text: "El filtro de agua lleva 3 meses sin cambio. Maria pidio que te recuerde comprarlo. Aqui esta el modelo exacto: Filtro Samsung DA29-00020B",
    time: "6:15 PM",
  },
  {
    sender: "user",
    text: "Ah cierto, lo compro hoy mismo",
    time: "6:18 PM",
  },
  {
    sender: "alma",
    text: "Genial! Le aviso a Maria que ya esta en camino.",
    time: "6:18 PM",
  },
] as const;

const CONVERSATIONS = {
  briefing: BRIEFING_MESSAGES,
  nudge: NUDGE_MESSAGES,
} as const;

function ReadReceipt() {
  return (
    <svg
      width="16"
      height="11"
      viewBox="0 0 16 11"
      fill="none"
      className="inline-block ml-1"
      aria-label="Read"
    >
      <path
        d="M11.07 0.65L4.98 6.73L2.93 4.68L1.51 6.1L4.98 9.57L12.49 2.07L11.07 0.65Z"
        fill="#53BDEB"
      />
      <path
        d="M14.07 0.65L7.98 6.73L7.11 5.86L5.7 7.28L7.98 9.57L15.49 2.07L14.07 0.65Z"
        fill="#53BDEB"
      />
    </svg>
  );
}

function ChatBubbleComponent({ bubble }: { readonly bubble: ChatBubble }) {
  const isAlma = bubble.sender === "alma";

  return (
    <div
      className={cn("flex", isAlma ? "justify-start" : "justify-end")}
    >
      <div
        className={cn(
          "relative max-w-[80%] rounded-lg px-3 py-2 text-[13px] leading-relaxed shadow-sm",
          isAlma
            ? "rounded-tl-none bg-white text-gray-800"
            : "rounded-tr-none bg-[#DCF8C6] text-gray-800",
        )}
      >
        {isAlma && (
          <span className="mb-0.5 block text-[11px] font-semibold text-olive">
            Alma
          </span>
        )}
        <span>{bubble.text}</span>
        <span className="ml-2 inline-flex items-center gap-0.5 align-bottom text-[10px] text-gray-400">
          {bubble.time}
          {!isAlma && <ReadReceipt />}
        </span>
      </div>
    </div>
  );
}

export function PhoneMockup({ variant, className }: PhoneMockupProps) {
  const messages = CONVERSATIONS[variant];

  return (
    <div
      className={cn(
        "relative mx-auto w-[280px] rounded-[2.5rem] border-[3px] border-gray-800 bg-gray-800 p-1 shadow-2xl",
        className,
      )}
    >
      {/* Notch */}
      <div className="absolute left-1/2 top-0 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-gray-800" />

      {/* Screen */}
      <div className="overflow-hidden rounded-[2.2rem] bg-[#ECE5DD]">
        {/* WhatsApp Header */}
        <div className="flex items-center gap-2.5 bg-[#075E54] px-4 pb-2.5 pt-8 text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-olive text-xs font-bold">
            A
          </div>
          <div>
            <div className="text-sm font-semibold">Alma</div>
            <div className="text-[10px] text-green-200">en linea</div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex flex-col gap-2 px-3 py-3">
          {messages.map((bubble, index) => (
            <ChatBubbleComponent key={index} bubble={bubble} />
          ))}
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2 bg-[#F0F0F0] px-3 py-2">
          <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[11px] text-gray-400">
            Escribe un mensaje...
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#075E54]">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="white"
              aria-hidden="true"
            >
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Home Indicator */}
      <div className="mx-auto mt-1 h-1 w-24 rounded-full bg-gray-500" />
    </div>
  );
}
