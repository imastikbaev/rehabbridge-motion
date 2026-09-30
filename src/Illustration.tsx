import type { Exercise, Side } from "./movement";
export function Illustration({
  exercise,
  side = "right",
  animated = false,
}: {
  exercise: Exercise;
  side?: Side;
  animated?: boolean;
}) {
  return (
    <svg
      className={`exercise-illustration ${animated ? "animated" : ""}`}
      viewBox="0 0 260 210"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="130" cy="188" rx="85" ry="10" fill="#dce9e1" />
      <g
        transform={
          side === "right" ? "translate(260 0) scale(-1 1)" : undefined
        }
      >
        <path
          d="M92 126V182M161 127V182M84 127H170"
          stroke="#a3b8af"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle cx="125" cy="41" r="20" fill="#e7c7ab" />
        <path d="M105 37C101 14 145 13 145 38L138 29L110 30" fill="#3d554d" />
        <path d="M99 72Q124 61 147 73L158 131H94Z" fill="#568f79" />
        <path
          d="M108 134L107 178M143 134L148 178"
          stroke="#42655a"
          strokeWidth="17"
          strokeLinecap="round"
        />
        <path
          d="M147 78L161 106L151 123"
          stroke="#e7c7ab"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <g className={`moving-arm ${exercise}`}>
          {exercise === "bend" ? (
            <path
              d="M100 79L88 116L69 80"
              stroke="#dfb799"
              strokeWidth="12"
              strokeLinecap="round"
            />
          ) : exercise === "reach" ? (
            <path
              d="M100 79L73 96L39 107"
              stroke="#dfb799"
              strokeWidth="12"
              strokeLinecap="round"
            />
          ) : (
            <>
              <path
                d="M100 79L89 110L60 79"
                stroke="#dfb799"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M60 81V58M54 70L50 56M61 66L63 50M67 71L74 58M69 77L82 70"
                stroke="#dfb799"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </>
          )}
        </g>
        {exercise === "bend" ? (
          <path
            d="M48 126Q30 104 43 82M38 88L44 79L48 90"
            stroke="#2a745b"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ) : exercise === "reach" ? (
          <path
            d="M55 124H25M33 117L24 124L33 131"
            stroke="#2a745b"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ) : (
          <circle
            cx="62"
            cy="65"
            r="35"
            stroke="#87ac83"
            strokeWidth="2"
            strokeDasharray="4 6"
          />
        )}
      </g>
    </svg>
  );
}
