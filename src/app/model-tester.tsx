"use client";

import { useState } from "react";

type ModelResponse = {
  output?: unknown;
  error?: unknown;
};

type RequestMode = "idle" | "standard" | "streaming";

export function ModelTester() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [requestMode, setRequestMode] = useState<RequestMode>("idle");

  const isLoading = requestMode !== "idle";
  const isInputEmpty = input.trim().length === 0;

  async function sendInput(): Promise<void> {
    setRequestMode("standard");
    setOutput("");

    try {
      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, stream: false }),
      });
      const data = (await response.json()) as ModelResponse;

      if (!response.ok) {
        setOutput(
          typeof data.error === "string" ? data.error : "Request failed.",
        );
        return;
      }

      setOutput(
        typeof data.output === "string" ? data.output : "No text returned.",
      );
    } catch {
      setOutput("Request failed.");
    } finally {
      setRequestMode("idle");
    }
  }

  async function streamInput(): Promise<void> {
    setRequestMode("streaming");
    setOutput("");

    try {
      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, stream: true }),
      });

      if (!response.ok) {
        const data = (await response.json()) as ModelResponse;
        setOutput(
          typeof data.error === "string" ? data.error : "Request failed.",
        );
        return;
      }

      if (!response.body) {
        setOutput("No response stream returned.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        setOutput((currentOutput) => currentOutput + decoder.decode(value));
      }
    } catch {
      setOutput("Request failed.");
    } finally {
      setRequestMode("idle");
    }
  }

  return (
    <section className="mt-10 w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <label
        htmlFor="model-input"
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Text to send
      </label>
      <textarea
        id="model-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        className="mt-2 min-h-32 w-full rounded-xl border border-zinc-300 bg-transparent p-3 text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:text-zinc-50 dark:focus:border-zinc-50"
        placeholder="Type a message..."
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={sendInput}
          disabled={isLoading || isInputEmpty}
          className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          {requestMode === "standard" ? "Sending..." : "Send"}
        </button>
        <button
          type="button"
          onClick={streamInput}
          disabled={isLoading || isInputEmpty}
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          {requestMode === "streaming" ? "Streaming..." : "Stream"}
        </button>
      </div>
      {output ? (
        <div className="mt-6 whitespace-pre-wrap rounded-xl bg-zinc-100 p-4 text-sm leading-6 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {output}
        </div>
      ) : null}
    </section>
  );
}
