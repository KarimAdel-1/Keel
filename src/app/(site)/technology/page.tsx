import { Cpu, Gauge, Layers, ShieldCheck, Swords, Workflow } from "lucide-react";
import type { Metadata } from "next";
import { Band, BuiltOn, CtaBand, PageHero, Pill, Points, SectionTitle } from "@/components/site/parts";
import { AUTO_BLURB, MODEL_KEYS, MODELS, VISION_MODEL } from "@/lib/models";
import { CREW, type Team } from "@/platform/crew";
import { currentUser } from "@/platform/session";

export const metadata: Metadata = { title: "Technology", description: "How Keel is built: NVIDIA Nemotron models on Nebius Token Factory, NVIDIA NeMo Guardrails, NVIDIA garak, and LangGraph." };

const TEAMS: Team[] = ["Customer turn", "Testing", "Quality", "Improvement", "Copilot", "Insights", "Knowledge"];

/** Each team of agents is a LangGraph graph of this shape. */
const GRAPHS: { team: string; shape: string }[] = [
  { team: "Customer turn, for every message", shape: "recall → retrieve → route → respond → suggest → remember, with the customer agent's own think-and-act loop inside respond" },
  { team: "Testing", shape: "customer ⇄ agent, then check the actions → first judge → careful judge" },
  { team: "Quality", shape: "write questions → ask → grade → check the tests → check the judges" },
  { team: "Improvement", shape: "prepare → measure → diagnose → propose → try on copies → confirm, round after round" },
  { team: "Copilot", shape: "supervisor → specialists, several at once when asked" },
];

/** The model an agent runs on, as the page shows it: the search's embedding model is named by what it is. */
const modelLabel = (id: string, model: string) => (id === "search" ? "An embedding model on Nebius Token Factory" : model);

export default async function TechnologyPage() {
  const user = await currentUser();
  const start = user ? "/app" : "/signup";
  return (
    <>
      <PageHero
        eyebrow="Technology"
        title="Built on NVIDIA Nemotron, checked by NVIDIA's own tools"
        intro="Every answer, test, grade and fix in Keel comes from NVIDIA Nemotron models, served by Nebius Token Factory. NVIDIA NeMo Guardrails guards each conversation, NVIDIA garak attacks the agent before launch, and every team of agents is a LangGraph graph."
        actions={
          <>
            <Pill href={start}>{user ? "Open your dashboard" : "Try it for free"}</Pill>
            <Pill href="/product" variant="outline">
              Product overview
            </Pill>
          </>
        }
        footer={<BuiltOn centered />}
      />

      <Band grey>
        <SectionTitle title="Five Nemotron models, each where it fits" text="Your agent answers with the model you choose. Keel's own agents each use the one that does their job best, and NVIDIA's vision model reads pictures." />
        <div className="mx-auto mt-12 grid max-w-[1100px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODEL_KEYS.map((key) => {
            const model = MODELS[key];
            const uses = CREW.filter((m) => m.model.includes(model.name));
            return (
              <div key={key} className="flex flex-col rounded-[18px] border border-[#eceef2] bg-white p-6">
                <Cpu className="size-5 text-[#2348d8]" />
                <h3 className="mt-4 text-[17px] font-medium tracking-[-0.01em]">{model.name}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#5b5f66]">{model.blurb}</p>
                <p className="mt-5 text-[12px] font-medium text-[#8a8f98]">In Keel</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#2b2e33]">{uses.length ? uses.map((m) => m.name).join(", ") : "Available for your agent's answers"}</p>
              </div>
            );
          })}
        </div>
        <div className="mx-auto mt-4 grid max-w-[1100px] gap-4 md:grid-cols-2">
          <div className="rounded-[18px] border border-[#eceef2] bg-white p-6">
            <h3 className="text-[16px] font-medium">Or let Keel choose for each message</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#5b5f66]">{AUTO_BLURB}</p>
          </div>
          <div className="rounded-[18px] border border-[#eceef2] bg-white p-6">
            <h3 className="text-[16px] font-medium">{VISION_MODEL.name}, for pictures</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#5b5f66]">{VISION_MODEL.blurb}</p>
            <p className="mt-3 text-[13.5px] text-[#2b2e33]">{CREW.filter((m) => m.model === VISION_MODEL.name).map((m) => m.name).join(", ")}</p>
          </div>
        </div>
      </Band>

      <Band>
        <SectionTitle title="Keel's own agents" text={`${CREW.length} agents do Keel's work, each with one job, in teams. This list is the one the product meters usage by.`} />
        <div className="mx-auto mt-12 max-w-[1100px] space-y-10">
          {TEAMS.map((team) => {
            const members = CREW.filter((m) => m.team === team);
            if (!members.length) return null;
            return (
              <div key={team}>
                <p className="mb-3 text-[13px] font-medium text-[#2348d8]">{team}</p>
                <div className="overflow-hidden rounded-[14px] border border-[#eceef2]">
                  {members.map((m) => (
                    <div key={m.id} className="grid gap-1 border-b border-[#f0f1f3] bg-white px-5 py-4 last:border-b-0 md:grid-cols-[200px_1fr_240px] md:gap-6">
                      <p className="text-[15px] font-medium">{m.name}</p>
                      <p className="text-[14px] leading-relaxed text-[#5b5f66]">{m.does}</p>
                      <p className="text-[13px] text-[#2b2e33]">{modelLabel(m.id, m.model)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Band>

      <Band grey>
        <SectionTitle title="Every team is a LangGraph graph" text="Every model call goes through LangChain. Each team runs as a graph with a fixed shape, so a request never passes through agents that have nothing to do with it." />
        <div className="mx-auto mt-12 max-w-[1000px] overflow-hidden rounded-[14px] border border-[#eceef2] bg-white">
          {GRAPHS.map((g) => (
            <div key={g.team} className="grid gap-1 border-b border-[#f0f1f3] px-5 py-4 last:border-b-0 md:grid-cols-[260px_1fr] md:gap-6">
              <p className="text-[15px] font-medium">{g.team}</p>
              <p className="font-mono text-[13px] leading-relaxed text-[#3c4047]">{g.shape}</p>
            </div>
          ))}
        </div>
      </Band>

      <Band>
        <SectionTitle title="NVIDIA's tools, doing what they do best" />
        <div className="mx-auto mt-12 max-w-[1100px]">
          <Points
            columns={2}
            items={[
              { title: "NVIDIA NeMo Guardrails", text: "Checks each customer message, and if you like each reply, against rules you write in plain words, in its LangChain mode. A switch on each agent's Safety and limits page.", icon: <ShieldCheck className="size-5" /> },
              { title: "NVIDIA garak", text: "Attacks the agent through a private endpoint on the server, with a one-scan token, through the same path a customer's message takes. Nemotron 3 Super confirms each attack it flags.", icon: <Swords className="size-5" /> },
              { title: "Nebius Token Factory", text: "Serves every Nemotron model and the embeddings behind knowledge search, through one OpenAI-compatible API.", icon: <Layers className="size-5" /> },
              { title: "LangChain and LangGraph", text: "Every model call goes through LangChain; every team of agents is a LangGraph graph, from the customer turn to the Copilot.", icon: <Workflow className="size-5" /> },
            ]}
          />
        </div>
      </Band>

      <Band grey>
        <SectionTitle title="Quality first, then cost" text="Keel never cuts what an answer needs. It saves tokens by not doing work whose answer is already known." />
        <div className="mx-auto mt-12 max-w-[1100px]">
          <Points
            items={[
              { title: "The careful model only when needed", text: "Super judges first; Ultra judges again only when Super isn't sure or says the agent got a fact wrong.", icon: <Gauge className="size-5" /> },
              { title: "Stops when the answer is known", text: "A test that called the wrong actions fails with no judge. The improvement agent stops a test's runs once its result is decided.", icon: <Gauge className="size-5" /> },
              { title: "Every token counted", text: "The Usage page shows the tokens each agent and each of Keel's own jobs used.", icon: <Gauge className="size-5" /> },
            ]}
          />
        </div>
      </Band>

      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
