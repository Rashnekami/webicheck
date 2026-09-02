import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  History,
  KeyRound,
  LayoutDashboard,
  Loader2,
  MapPin,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  StickyNote,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { PostitCard, POSTIT_STATUS, PRIORITY_LABELS } from "@/components/postit/postit-card";
import {
  addPostitComment,
  bootstrapPostit,
  closePostitMeeting,
  createPostitItem,
  createPostitMeeting,
  extendPostitDeadline,
  getPostitAccess,
  getPostitWorkspace,
  issuePostitCredential,
  markPostitNotificationsRead,
  resetPostitCredential,
  savePostitDepartment,
  savePostitGroup,
  savePostitPerson,
  savePostitVisibilityGrant,
  startPostitItem,
  submitPostitCompletion,
  validatePostitCompletion,
  type PostitMemberRole,
  type PostitItemRow,
  type PostitPriority,
  type PostitStatus,
  type PostitWorkspace,
} from "@/lib/postit.functions";

export const Route = createFileRoute("/_authenticated/postit")({
  head: () => ({
    meta: [
      { title: "Postit! — Gestão de reuniões GR" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Pendências, responsáveis, prazos e escalonamentos das reuniões de gerência.",
      },
    ],
  }),
  component: PostitPage,
});

const ROLE_LABELS: Record<PostitMemberRole, string> = {
  member: "Colaborador",
  leader: "Líder",
  manager: "Gestor / Supervisor",
  director: "Diretoria",
  admin: "Administrador",
};

const FILTERS: Array<{ value: "all" | PostitStatus; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abertos" },
  { value: "in_progress", label: "Em andamento" },
  { value: "overdue", label: "Fora do prazo" },
  { value: "escalated", label: "Escalados" },
  { value: "awaiting_validation", label: "Validação" },
  { value: "completed", label: "Concluídos" },
];

function asDateTimeLocal(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function formatDate(date?: string | null) {
  if (!date) return "—";
  return format(parseISO(date), "dd/MM/yyyy", { locale: ptBR });
}

function formatDateTime(date?: string | null) {
  if (!date) return "—";
  return format(parseISO(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function PostitPage() {
  const qc = useQueryClient();
  const activationAttempted = useRef(false);
  const access = useQuery({ queryKey: ["postit-access"], queryFn: () => getPostitAccess() });
  const activate = useMutation({
    mutationFn: () => bootstrapPostit(),
    onSuccess: async (result) => {
      qc.setQueryData(["postit-access"], result.access);
      await qc.invalidateQueries({ queryKey: ["postit-workspace"] });
      toast.success("Postit! ativado com os setores iniciais.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const shouldActivate = Boolean(
    access.data?.hasAccess && access.data.canBootstrap && !access.data.memberRole,
  );
  useEffect(() => {
    if (!shouldActivate || activationAttempted.current) return;
    activationAttempted.current = true;
    activate.mutate();
  }, [activate, shouldActivate]);

  if (access.isLoading) {
    return <LoadingPage label="Abrindo o Postit!" />;
  }
  if (access.isError) {
    return (
      <ModuleMessage
        icon={ShieldAlert}
        title="Estrutura do Postit! ainda não disponível"
        description="A atualização do banco precisa ser aplicada antes de abrir este módulo."
      />
    );
  }
  if (!access.data?.hasAccess) {
    return (
      <ModuleMessage
        icon={StickyNote}
        title="Acesso ao Postit! não liberado"
        description="Seu administrador precisa cadastrar você em um setor e definir sua posição na hierarquia."
      />
    );
  }
  if (shouldActivate) {
    if (activate.isError) {
      return (
        <ModuleMessage
          icon={ShieldAlert}
          title="Não foi possível ativar o Postit!"
          description={
            activate.error instanceof Error
              ? activate.error.message
              : "A ativação não foi confirmada pelo banco de dados."
          }
          action={
            <Button
              onClick={() => {
                activate.reset();
                activate.mutate();
              }}
              disabled={activate.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar ativar novamente
            </Button>
          }
        />
      );
    }
    return <LoadingPage label="Ativando o Postit! neste provedor" />;
  }
  return <PostitWorkspacePage />;
}

function LoadingPage({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
      <Loader2 className="mr-2 h-5 w-5 animate-spin text-amber-400" /> {label}
    </div>
  );
}

function ModuleMessage({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-16">
      <Card className="mx-auto max-w-lg border-amber-300/20 bg-slate-900/80">
        <CardContent className="space-y-4 p-7 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-300">
            <Icon className="h-8 w-8" />
          </span>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <p className="text-sm leading-relaxed text-slate-400">{description}</p>
          {action}
          <div>
            <Button asChild variant="ghost">
              <Link to="/painel">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao CheckTecnico
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PostitWorkspacePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const workspace = useQuery({
    queryKey: ["postit-workspace"],
    queryFn: () => getPostitWorkspace(),
    refetchInterval: 60_000,
  });

  if (workspace.isLoading) return <LoadingPage label="Carregando compromissos" />;
  if (workspace.isError || !workspace.data) {
    return (
      <ModuleMessage
        icon={AlertTriangle}
        title="Não foi possível carregar o Postit!"
        description={
          workspace.error instanceof Error
            ? workspace.error.message
            : "Tente novamente em instantes."
        }
        action={
          <Button onClick={() => workspace.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
          </Button>
        }
      />
    );
  }

  const data = workspace.data;
  const unread = data.notifications.filter((notification) => !notification.read_at).length;
  const selected = data.items.find((item) => item.id === selectedId) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["postit-workspace"] });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,.10),_transparent_30%),linear-gradient(180deg,#07101f_0%,#020617_100%)] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 rotate-[-3deg] items-center justify-center rounded-xl bg-amber-300 text-slate-950 shadow-lg shadow-amber-400/20">
              <StickyNote className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black tracking-tight text-white">
                Postit<span className="text-amber-300">!</span>
              </h1>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">
                Reuniões GR e compromissos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="relative text-slate-300 hover:text-amber-200"
              onClick={() => setTab("notifications")}
            >
              <Bell className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Notificações</span>
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold text-white">
                  {unread}
                </span>
              ) : null}
            </Button>
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="border-white/10 bg-white/5 text-slate-200"
            >
              <Link to="/painel">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">CheckTecnico</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="border-white/10 bg-white/5 text-slate-200"
            >
              <Link to="/minha-conta">
                <KeyRound className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Minha conta</span>
              </Link>
            </Button>
            <Button
              size="sm"
              className="bg-amber-300 text-slate-950 hover:bg-amber-200"
              onClick={() => setNewItemOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Novo post-it
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-7 grid h-auto w-full grid-cols-5 gap-1 bg-slate-900/80 p-1 sm:w-auto sm:inline-grid">
            <TabsTrigger value="dashboard" className="gap-1.5 px-2 sm:px-4">
              <LayoutDashboard className="h-4 w-4" />{" "}
              <span className="hidden sm:inline">Visão geral</span>
            </TabsTrigger>
            <TabsTrigger value="items" className="gap-1.5 px-2 sm:px-4">
              <StickyNote className="h-4 w-4" /> <span className="hidden sm:inline">Post-its</span>
            </TabsTrigger>
            <TabsTrigger value="meetings" className="gap-1.5 px-2 sm:px-4">
              <CalendarDays className="h-4 w-4" />{" "}
              <span className="hidden sm:inline">Reuniões GR</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5 px-2 sm:px-4">
              <UsersRound className="h-4 w-4" /> <span className="hidden sm:inline">Equipe</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 px-2 sm:px-4">
              <Bell className="h-4 w-4" /> <span className="hidden sm:inline">Avisos</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardPanel
              data={data}
              openItem={setSelectedId}
              onNew={() => setNewItemOpen(true)}
            />
          </TabsContent>
          <TabsContent value="items">
            <ItemsPanel data={data} openItem={setSelectedId} />
          </TabsContent>
          <TabsContent value="meetings">
            <MeetingsPanel data={data} refresh={refresh} />
          </TabsContent>
          <TabsContent value="team">
            <TeamPanel data={data} refresh={refresh} />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsPanel data={data} refresh={refresh} openItem={setSelectedId} />
          </TabsContent>
        </Tabs>
      </main>

      <NewPostitDialog
        open={newItemOpen}
        onOpenChange={setNewItemOpen}
        data={data}
        refresh={refresh}
      />
      <PostitDetailDialog
        item={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        data={data}
        refresh={refresh}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <Card className="border-white/10 bg-slate-950/55">
      <CardContent className="flex items-center gap-4 p-5">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-3xl font-black tracking-tight text-white">{value}</p>
          <p className="text-xs text-slate-400">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardPanel({
  data,
  openItem,
  onNew,
}: {
  data: PostitWorkspace;
  openItem: (id: string) => void;
  onNew: () => void;
}) {
  const active = data.items.filter((item) => !["completed", "cancelled"].includes(item.status));
  const completed = data.items.filter((item) => item.status === "completed");
  const overdue = data.items.filter((item) => item.status === "overdue");
  const escalated = data.items.filter((item) => item.status === "escalated");
  const awaiting = data.items.filter((item) => item.status === "awaiting_validation");
  const departments = data.departments.filter((department) => department.active);

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
            Painel executivo
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
            O que precisa andar
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Pendências das reuniões, prazos e cobranças em um só lugar.
          </p>
        </div>
        <Button className="bg-amber-300 text-slate-950 hover:bg-amber-200" onClick={onNew}>
          <Plus className="mr-2 h-4 w-4" /> Abrir compromisso
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={CircleDot}
          value={active.length}
          label="Em aberto"
          tone="bg-sky-400/10 text-sky-300"
        />
        <MetricCard
          icon={CheckCircle2}
          value={completed.length}
          label="Concluídos"
          tone="bg-emerald-400/10 text-emerald-300"
        />
        <MetricCard
          icon={Clock3}
          value={overdue.length}
          label="Fora do prazo"
          tone="bg-orange-400/10 text-orange-300"
        />
        <MetricCard
          icon={AlertTriangle}
          value={escalated.length}
          label="Escalados"
          tone="bg-rose-400/10 text-rose-300"
        />
        <MetricCard
          icon={Check}
          value={awaiting.length}
          label="Para validar"
          tone="bg-violet-400/10 text-violet-300"
        />
      </section>

      <section className="space-y-9">
        {departments
          .map((department) => ({
            department,
            items: active
              .filter((item) => item.department_id === department.id)
              .sort((a, b) => a.current_due_date.localeCompare(b.current_due_date)),
          }))
          .filter((group) => group.items.length)
          .map(({ department, items }) => (
            <div key={department.id}>
              <div className="mb-4 flex items-center gap-3">
                <span
                  className="h-10 w-2 rounded-full shadow-lg"
                  style={{ backgroundColor: department.color }}
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-500">
                    Pendências por setor
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-white">
                    {department.name}{" "}
                    <span className="text-sm font-medium text-slate-500">({items.length})</span>
                  </h3>
                </div>
              </div>
              <div className="space-y-6">
                {[...new Set(items.map((item) => item.group_id || "none"))].map((bucketId) => {
                  const group = data.groups.find((row) => row.id === bucketId);
                  const groupItems = items.filter((item) => (item.group_id || "none") === bucketId);
                  return (
                    <div key={bucketId}>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge className="border-white/10 bg-white/5 text-slate-300">
                          <UsersRound className="mr-1.5 h-3.5 w-3.5" />
                          {group?.name || "Sem grupo"}
                        </Badge>
                        {group?.city_names?.length ? (
                          <span className="text-xs text-slate-500">
                            {group.city_names.join(" · ")}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {groupItems.map((item) => (
                          <PostitCard
                            key={item.id}
                            item={item}
                            departmentName={departmentName(data, item.department_id)}
                            departmentColor={departmentColor(data, item.department_id)}
                            responsibleName={itemAssigneeNames(data, item.id)}
                            onClick={() => openItem(item.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        {!active.length ? (
          <EmptyState
            title="Nenhuma pendência aberta"
            description="Os próximos compromissos aparecerão aqui separados por setor."
          />
        ) : null}
      </section>

      <section>
        <Card className="border-white/10 bg-slate-950/55">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-500">
                  Desempenho
                </p>
                <h3 className="font-bold text-white">Conclusão por setor</h3>
              </div>
            </div>
            <div className="mt-6 space-y-5">
              {departments.map((department) => {
                const rows = data.items.filter(
                  (item) => item.department_id === department.id && item.status !== "cancelled",
                );
                const done = rows.filter((item) => item.status === "completed").length;
                const percentage = rows.length ? Math.round((done / rows.length) * 100) : 0;
                return (
                  <div key={department.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-medium text-slate-200">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: department.color }}
                        />
                        {department.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {done}/{rows.length} · {percentage}%
                      </span>
                    </div>
                    <Progress value={percentage} className="h-1.5 bg-white/5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ItemsPanel({ data, openItem }: { data: PostitWorkspace; openItem: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | PostitStatus>("all");
  const [search, setSearch] = useState("");
  const list = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!needle) return true;
      return `${item.code} ${item.title} ${item.description} ${itemAssigneeNames(data, item.id)}`
        .toLowerCase()
        .includes(needle);
    });
  }, [data, filter, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
            Quadro de compromissos
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">Todos os post-its</h2>
        </div>
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por código, assunto ou pessoa"
            className="border-white/10 bg-slate-900/70 pl-10"
          />
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={filter === item.value ? "default" : "outline"}
            className={
              filter === item.value
                ? "bg-amber-300 text-slate-950 hover:bg-amber-200"
                : "border-white/10 bg-white/5 text-slate-300"
            }
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {list.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((item) => (
            <PostitCard
              key={item.id}
              item={item}
              departmentName={departmentName(data, item.department_id)}
              departmentColor={departmentColor(data, item.department_id)}
              responsibleName={itemAssigneeNames(data, item.id)}
              onClick={() => openItem(item.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="Nada encontrado" description="Altere o filtro ou o termo pesquisado." />
      )}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-dashed border-white/10 bg-white/[.02]">
      <CardContent className="p-10 text-center">
        <StickyNote className="mx-auto h-9 w-9 text-slate-600" />
        <h3 className="mt-3 font-semibold text-slate-200">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </CardContent>
    </Card>
  );
}

function NewPostitDialog({
  open,
  onOpenChange,
  data,
  refresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PostitWorkspace;
  refresh: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [groupId, setGroupId] = useState("none");
  const [primaryPersonId, setPrimaryPersonId] = useState("");
  const [secondaryPersonId, setSecondaryPersonId] = useState("none");
  const [meetingId, setMeetingId] = useState("none");
  const [sourceType, setSourceType] = useState<
    "meeting" | "sector" | "managerial" | "sporadic" | "standalone"
  >("standalone");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [priority, setPriority] = useState<PostitPriority>("normal");
  const activePeople = data.people.filter(
    (person) => person.active && data.assignablePersonIds.includes(person.id),
  );
  const availableGroupIds = new Set(
    data.access.canAdminister
      ? data.groups.map((group) => group.id)
      : [
          ...data.personGroups
            .filter((row) => row.person_id === data.access.personId)
            .map((row) => row.group_id),
          ...data.visibilityGrants
            .filter((row) => row.grantee_person_id === data.access.personId && row.active)
            .map((row) => row.group_id),
        ],
  );
  const groupsForDepartment = data.groups.filter(
    (group) =>
      group.active && group.department_id === departmentId && availableGroupIds.has(group.id),
  );
  const peopleForSelection = activePeople.filter(
    (person) =>
      (!departmentId || person.department_id === departmentId) &&
      (groupId === "none" ||
        data.personGroups.some((row) => row.person_id === person.id && row.group_id === groupId)),
  );
  const create = useMutation({
    mutationFn: () =>
      createPostitItem({
        data: {
          title,
          description,
          departmentId,
          groupId: groupId === "none" ? null : groupId,
          assigneePersonIds: [primaryPersonId, secondaryPersonId].filter(
            (personId) => personId && personId !== "none",
          ),
          meetingId: sourceType === "meeting" && meetingId !== "none" ? meetingId : null,
          sourceType,
          dueDate,
          priority,
        },
      }),
    onSuccess: (result) => {
      toast.success(`${result.code} criado e enviado ao responsável.`);
      setTitle("");
      setDescription("");
      setPrimaryPersonId("");
      setSecondaryPersonId("none");
      setGroupId("none");
      onOpenChange(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-amber-300/20 bg-slate-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <StickyNote className="h-5 w-5 text-amber-300" /> Novo post-it
          </DialogTitle>
          <DialogDescription>
            Registre o compromisso, defina quem responde e a primeira data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Assunto</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: Arrumar a parede da loja"
            />
          </div>
          <div className="space-y-1.5">
            <Label>O que precisa ser resolvido?</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="Descreva o resultado esperado e as informações necessárias."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <Select
                value={departmentId}
                onValueChange={(value) => {
                  setDepartmentId(value);
                  setGroupId("none");
                  setPrimaryPersonId("");
                  setSecondaryPersonId("none");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  {data.departments
                    .filter((department) => department.active)
                    .map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Grupo / cidades</Label>
              <select
                value={groupId}
                onChange={(event) => {
                  setGroupId(event.target.value);
                  setPrimaryPersonId("");
                  setSecondaryPersonId("none");
                }}
                className="flex h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="none">Sem grupo específico</option>
                {groupsForDepartment.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} · {(group.city_names ?? []).join(", ") || "sem cidades"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável principal</Label>
              <Select
                value={primaryPersonId}
                onValueChange={(value) => {
                  setPrimaryPersonId(value);
                  if (secondaryPersonId === value) setSecondaryPersonId("none");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a pessoa" />
                </SelectTrigger>
                <SelectContent>
                  {peopleForSelection.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.full_name} · {person.position_title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Segundo responsável (opcional)</Label>
              <Select
                value={secondaryPersonId}
                onValueChange={setSecondaryPersonId}
                disabled={!primaryPersonId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Somente uma pessoa</SelectItem>
                  {peopleForSelection
                    .filter((person) => person.id !== primaryPersonId)
                    .map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.full_name} · {person.position_title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prazo inicial</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as PostitPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Origem do post-it</Label>
              <Select
                value={sourceType}
                onValueChange={(value) => {
                  setSourceType(
                    value as "meeting" | "sector" | "managerial" | "sporadic" | "standalone",
                  );
                  if (value !== "meeting") setMeetingId("none");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standalone">Avulso</SelectItem>
                  <SelectItem value="sporadic">Esporádico → próxima GR</SelectItem>
                  <SelectItem value="meeting">Reunião já cadastrada</SelectItem>
                </SelectContent>
              </Select>
              {sourceType === "sporadic" ? (
                <p className="text-xs text-amber-200/75">
                  Entrará automaticamente na pauta da próxima terça-feira, às 9h.
                </p>
              ) : null}
            </div>
            {sourceType === "meeting" ? (
              <div className="space-y-1.5">
                <Label>Reunião de origem</Label>
                <Select value={meetingId} onValueChange={setMeetingId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione uma reunião</SelectItem>
                    {data.meetings
                      .filter((meeting) => meeting.status !== "cancelled")
                      .map((meeting) => (
                        <SelectItem key={meeting.id} value={meeting.id}>
                          {meeting.title} · {formatDateTime(meeting.scheduled_at)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-amber-300 text-slate-950 hover:bg-amber-200"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Criar e notificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MeetingsPanel({ data, refresh }: { data: PostitWorkspace; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<"managerial" | "sector" | "sporadic">("sector");
  const [departmentId, setDepartmentId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(asDateTimeLocal());
  const create = useMutation({
    mutationFn: () =>
      createPostitMeeting({
        data: {
          title,
          meetingType,
          departmentId: departmentId || null,
          scheduledAt: new Date(scheduledAt).toISOString(),
        },
      }),
    onSuccess: () => {
      toast.success("Reunião GR criada.");
      setOpen(false);
      setTitle("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const close = useMutation({
    mutationFn: (meetingId: string) => closePostitMeeting({ data: { meetingId } }),
    onSuccess: () => {
      toast.success("Reunião encerrada.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const canCreate = data.access.canManage || data.access.memberRole === "leader";

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
            Reuniões de gerência
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">GR geral e por setor</h2>
        </div>
        {canCreate ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-300 text-slate-950 hover:bg-amber-200">
                <Plus className="mr-2 h-4 w-4" /> Nova GR
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-950">
              <DialogHeader>
                <DialogTitle>Nova reunião GR</DialogTitle>
                <DialogDescription>
                  Os post-its abertos nela ficarão ligados à reunião.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nome da reunião</Label>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ex.: GR Técnica — Setembro"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select
                      value={meetingType}
                      onValueChange={(value) =>
                        setMeetingType(value as "managerial" | "sector" | "sporadic")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sector">GR do setor</SelectItem>
                        <SelectItem value="managerial">GR Gerencial</SelectItem>
                        <SelectItem value="sporadic">Reunião esporádica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data e hora</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(event) => setScheduledAt(event.target.value)}
                    />
                  </div>
                </div>
                {meetingType === "sector" ? (
                  <div className="space-y-1.5">
                    <Label>Setor</Label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.departments
                          .filter((department) => department.active)
                          .map((department) => (
                            <SelectItem key={department.id} value={department.id}>
                              {department.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  Criar reunião
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
      {data.meetings.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.meetings.map((meeting) => {
            const items = data.items.filter((item) => item.meeting_id === meeting.id);
            const pending = items.filter(
              (item) => !["completed", "cancelled"].includes(item.status),
            ).length;
            return (
              <Card key={meeting.id} className="border-white/10 bg-slate-950/55">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge
                        variant="outline"
                        className={
                          ["general", "managerial"].includes(meeting.meeting_type)
                            ? "border-amber-300/30 text-amber-200"
                            : "border-sky-300/30 text-sky-200"
                        }
                      >
                        {["general", "managerial"].includes(meeting.meeting_type)
                          ? "GR Gerencial"
                          : meeting.meeting_type === "sporadic"
                            ? "Esporádica"
                            : departmentName(data, meeting.department_id)}
                      </Badge>
                      <h3 className="mt-3 text-lg font-bold text-white">{meeting.title}</h3>
                      <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                        <CalendarDays className="h-4 w-4" /> {formatDateTime(meeting.scheduled_at)}
                      </p>
                    </div>
                    <Badge
                      className={
                        meeting.status === "closed"
                          ? "bg-emerald-400/10 text-emerald-300"
                          : "bg-sky-400/10 text-sky-300"
                      }
                    >
                      {meeting.status === "closed" ? "Encerrada" : "Programada"}
                    </Badge>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-2xl font-black text-white">{items.length}</p>
                      <p className="text-xs text-slate-500">Post-its abertos</p>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-2xl font-black text-amber-300">{pending}</p>
                      <p className="text-xs text-slate-500">Ainda pendentes</p>
                    </div>
                  </div>
                  {meeting.status !== "closed" &&
                  (data.access.canManage || meeting.created_by === data.currentUserId) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4 border-white/10"
                      onClick={() => close.mutate(meeting.id)}
                      disabled={close.isPending}
                    >
                      <Check className="mr-2 h-4 w-4" /> Encerrar reunião
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma reunião cadastrada"
          description="Crie a primeira GR para ligar as pendências à pauta correta."
        />
      )}
    </div>
  );
}

function TeamPanel({ data, refresh }: { data: PostitWorkspace; refresh: () => void }) {
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const [personTab, setPersonTab] = useState("dados");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [departmentNameValue, setDepartmentNameValue] = useState("");
  const [departmentColorValue, setDepartmentColorValue] = useState("#facc15");
  const [groupDepartmentId, setGroupDepartmentId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupCities, setGroupCities] = useState("");
  const [coverageGroupId, setCoverageGroupId] = useState("");
  const [coveragePersonId, setCoveragePersonId] = useState("");
  const [coverageReason, setCoverageReason] = useState("Cobertura de férias");
  const [coverageStartsAt, setCoverageStartsAt] = useState(asDateTimeLocal());
  const [coverageEndsAt, setCoverageEndsAt] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [positionTitle, setPositionTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("none");
  const [role, setRole] = useState<PostitMemberRole>("member");
  const [leaderPersonIds, setLeaderPersonIds] = useState<string[]>([]);
  const [cityNamesValue, setCityNamesValue] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [ledGroupIds, setLedGroupIds] = useState<string[]>([]);
  const [departmentResponsible, setDepartmentResponsible] = useState(false);
  const [issuedCredential, setIssuedCredential] = useState<{
    login: string;
    password: string;
  } | null>(null);

  const canCreatePeople =
    data.access.canAdminister || ["leader", "manager"].includes(data.access.memberRole ?? "");
  const canCreateGroups =
    data.access.canAdminister ||
    data.departmentLeaders.some((row) => row.person_id === data.access.personId);
  const possibleLeaders = data.people.filter(
    (person) =>
      person.active &&
      person.id !== editingId &&
      ["leader", "manager", "director", "admin"].includes(person.role),
  );
  const groupsForPerson = data.groups.filter(
    (group) => group.active && group.department_id === departmentId,
  );
  const selectedPerson = data.people.find((person) => person.id === editingId);
  const selectedAccount = selectedPerson?.user_id
    ? data.loginAccounts.find((account) => account.user_id === selectedPerson.user_id)
    : null;

  function resetPersonForm() {
    setEditingId(null);
    setFullName("");
    setEmail("");
    setPositionTitle("");
    setDepartmentId("none");
    setRole("member");
    setLeaderPersonIds([]);
    setCityNamesValue("");
    setGroupIds([]);
    setLedGroupIds([]);
    setDepartmentResponsible(false);
    setIssuedCredential(null);
    setPersonTab("dados");
  }

  function editPerson(person: PostitWorkspace["people"][number]) {
    setEditingId(person.id);
    setFullName(person.full_name);
    setEmail(person.email || "");
    setPositionTitle(person.position_title);
    setDepartmentId(person.department_id || "none");
    setRole(person.role);
    setCityNamesValue((person.city_names ?? []).join(", "));
    const memberships = data.personGroups.filter((row) => row.person_id === person.id);
    setGroupIds(memberships.map((row) => row.group_id));
    setLedGroupIds(memberships.filter((row) => row.is_leader).map((row) => row.group_id));
    setDepartmentResponsible(data.departmentLeaders.some((row) => row.person_id === person.id));
    setLeaderPersonIds(
      data.reportingLines
        .filter((line) => line.subordinate_person_id === person.id)
        .map((line) => line.leader_person_id),
    );
    setIssuedCredential(null);
    setPersonTab("dados");
    setPersonOpen(true);
  }

  function canEditPerson(personId: string) {
    return (
      data.access.canAdminister ||
      data.reportingLines.some(
        (line) =>
          line.subordinate_person_id === personId && line.leader_person_id === data.access.personId,
      )
    );
  }

  const saveDepartment = useMutation({
    mutationFn: () =>
      savePostitDepartment({ data: { name: departmentNameValue, color: departmentColorValue } }),
    onSuccess: () => {
      toast.success("Setor criado.");
      setDepartmentOpen(false);
      setDepartmentNameValue("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveGroup = useMutation({
    mutationFn: () =>
      savePostitGroup({
        data: {
          departmentId: groupDepartmentId,
          name: groupName,
          cityNames: groupCities.split(","),
        },
      }),
    onSuccess: () => {
      toast.success("Grupo criado.");
      setGroupOpen(false);
      setGroupName("");
      setGroupCities("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const savePerson = useMutation({
    mutationFn: () =>
      savePostitPerson({
        data: {
          id: editingId || undefined,
          fullName,
          email: email || null,
          positionTitle,
          departmentId: departmentId === "none" ? null : departmentId,
          role,
          leaderPersonIds,
          cityNames: cityNamesValue.split(","),
          groupIds,
          ledGroupIds,
          departmentResponsible,
        },
      }),
    onSuccess: (result) => {
      toast.success(editingId ? "Cadastro atualizado." : "Pessoa cadastrada no Postit!.");
      setEditingId(result.personId);
      setPersonTab("acesso");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const issueCredential = useMutation({
    mutationFn: () => issuePostitCredential({ data: { personId: editingId! } }),
    onSuccess: (result) => {
      setIssuedCredential({ login: result.login, password: result.password });
      toast.success("Login e senha temporária criados.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetCredential = useMutation({
    mutationFn: () => resetPostitCredential({ data: { accountId: selectedAccount!.id } }),
    onSuccess: (result) => {
      setIssuedCredential({ login: result.login, password: result.password });
      toast.success("Nova senha temporária criada.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveCoverage = useMutation({
    mutationFn: () =>
      savePostitVisibilityGrant({
        data: {
          groupId: coverageGroupId,
          granteePersonId: coveragePersonId,
          reason: coverageReason,
          startsAt: new Date(coverageStartsAt).toISOString(),
          endsAt: coverageEndsAt ? new Date(coverageEndsAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Cobertura temporária liberada.");
      setCoverageOpen(false);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const endCoverage = useMutation({
    mutationFn: (grant: PostitWorkspace["visibilityGrants"][number]) =>
      savePostitVisibilityGrant({
        data: {
          id: grant.id,
          groupId: grant.group_id,
          granteePersonId: grant.grantee_person_id,
          reason: grant.reason,
          startsAt: grant.starts_at,
          endsAt: grant.ends_at,
          active: false,
        },
      }),
    onSuccess: () => {
      toast.success("Cobertura encerrada.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function copyCredential() {
    if (!issuedCredential) return;
    await navigator.clipboard.writeText(
      "Login: " + issuedCredential.login + "\nSenha temporária: " + issuedCredential.password,
    );
    toast.success("Login e senha copiados.");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
            Diretório, cidades e cadeia de comando
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">Pessoas, grupos e acessos</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Setor define a área. Grupo separa cidades, lojas ou equipes e impede que um supervisor
            veja os post-its de outro grupo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.access.canAdminister ? (
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => setDepartmentOpen(true)}
            >
              <Building2 className="mr-2 h-4 w-4" /> Novo setor
            </Button>
          ) : null}
          {canCreateGroups ? (
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => setGroupOpen(true)}
            >
              <UsersRound className="mr-2 h-4 w-4" /> Novo grupo
            </Button>
          ) : null}
          {data.access.canAdminister ? (
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => setCoverageOpen(true)}
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> Cobertura
            </Button>
          ) : null}
          {canCreatePeople ? (
            <Button
              className="bg-amber-300 text-slate-950 hover:bg-amber-200"
              onClick={() => {
                resetPersonForm();
                if (!data.access.canAdminister && data.access.personId) {
                  setLeaderPersonIds([data.access.personId]);
                }
                setPersonOpen(true);
              }}
            >
              <UserRound className="mr-2 h-4 w-4" /> Cadastrar pessoa
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={departmentOpen} onOpenChange={setDepartmentOpen}>
        <DialogContent className="bg-slate-950">
          <DialogHeader>
            <DialogTitle>Novo setor</DialogTitle>
            <DialogDescription>A cor será usada nos post-its desse setor.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={departmentNameValue}
                onChange={(event) => setDepartmentNameValue(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <Input
                type="color"
                value={departmentColorValue}
                onChange={(event) => setDepartmentColorValue(event.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveDepartment.mutate()} disabled={saveDepartment.isPending}>
              Criar setor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="bg-slate-950">
          <DialogHeader>
            <DialogTitle>Novo grupo operacional</DialogTitle>
            <DialogDescription>
              Ex.: Técnica — Telêmaco/Imbaú/Tibagi ou Marketing — Lojas Norte.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <select
                value={groupDepartmentId}
                onChange={(event) => setGroupDepartmentId(event.target.value)}
                className="flex h-11 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-slate-100"
              >
                <option value="">Selecione</option>
                {data.departments
                  .filter((row) => row.active)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome do grupo</Label>
              <Input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Ex.: Equipe Técnica Norte"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cidades ou lojas</Label>
              <Input
                value={groupCities}
                onChange={(event) => setGroupCities(event.target.value)}
                placeholder="Telêmaco Borba, Imbaú, Tibagi"
              />
              <p className="text-xs text-slate-500">Separe várias localidades por vírgula.</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveGroup.mutate()} disabled={saveGroup.isPending}>
              Criar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={coverageOpen} onOpenChange={setCoverageOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto bg-slate-950">
          <DialogHeader>
            <DialogTitle>Liberar cobertura temporária</DialogTitle>
            <DialogDescription>
              Use para férias ou afastamentos. A pessoa verá somente o grupo escolhido durante o
              período.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Grupo que será coberto</Label>
              <select
                value={coverageGroupId}
                onChange={(event) => setCoverageGroupId(event.target.value)}
                className="flex h-11 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-slate-100"
              >
                <option value="">Selecione</option>
                {data.groups
                  .filter((row) => row.active)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {(row.city_names ?? []).join(", ")}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Quem assumirá</Label>
              <select
                value={coveragePersonId}
                onChange={(event) => setCoveragePersonId(event.target.value)}
                className="flex h-11 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-slate-100"
              >
                <option value="">Selecione</option>
                {data.people
                  .filter((row) => row.active)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.full_name} · {row.position_title}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Input
                value={coverageReason}
                onChange={(event) => setCoverageReason(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input
                  type="datetime-local"
                  value={coverageStartsAt}
                  onChange={(event) => setCoverageStartsAt(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Término (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={coverageEndsAt}
                  onChange={(event) => setCoverageEndsAt(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveCoverage.mutate()} disabled={saveCoverage.isPending}>
              Liberar acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={personOpen} onOpenChange={setPersonOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto bg-slate-950 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar pessoa" : "Nova pessoa"}</DialogTitle>
            <DialogDescription>
              O formulário permanece aberto enquanto você escolhe setor, grupo, cidades e líderes.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={personTab} onValueChange={setPersonTab}>
            <TabsList className="grid w-full grid-cols-2 bg-slate-900">
              <TabsTrigger value="dados">Cadastro e grupos</TabsTrigger>
              <TabsTrigger value="acesso">Acesso e senha</TabsTrigger>
            </TabsList>
            <TabsContent value="dados" className="space-y-4 pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Ex.: Wagner"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Cargo ou função</Label>
                  <Input
                    value={positionTitle}
                    onChange={(event) => setPositionTitle(event.target.value)}
                    placeholder="Ex.: Supervisor técnico"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>E-mail pessoal ou corporativo (opcional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="pessoa@empresa.com.br"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Setor</Label>
                  <select
                    value={departmentId}
                    onChange={(event) => {
                      setDepartmentId(event.target.value);
                      setGroupIds([]);
                      setLedGroupIds([]);
                    }}
                    className="flex h-11 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-slate-100"
                  >
                    <option value="none">Sem setor fixo</option>
                    {data.departments
                      .filter((row) => row.active)
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nível de permissão</Label>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as PostitMemberRole)}
                    className="flex h-11 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-slate-100"
                  >
                    <option value="member">Colaborador</option>
                    <option value="leader">Líder</option>
                    {data.access.canAdminister ? (
                      <>
                        <option value="manager">Gestor / Supervisor</option>
                        <option value="director">Diretoria / Gerência Geral</option>
                        <option value="admin">Administrador total</option>
                      </>
                    ) : null}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cidade, cidades ou lojas</Label>
                <Input
                  value={cityNamesValue}
                  onChange={(event) => setCityNamesValue(event.target.value)}
                  placeholder="Telêmaco Borba, Imbaú, Tibagi"
                />
                <p className="text-xs text-slate-500">Separe várias localidades por vírgula.</p>
              </div>
              {groupsForPerson.length ? (
                <div className="space-y-2">
                  <Label>Grupos deste setor</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {groupsForPerson.map((group) => {
                      const selected = groupIds.includes(group.id);
                      const leads = ledGroupIds.includes(group.id);
                      return (
                        <div
                          key={group.id}
                          className={
                            "rounded-xl border p-3 " +
                            (selected
                              ? "border-amber-300/40 bg-amber-300/10"
                              : "border-white/10 bg-white/[.03]")
                          }
                        >
                          <button
                            type="button"
                            className="flex w-full items-start justify-between gap-2 text-left"
                            onClick={() => {
                              setGroupIds((current) =>
                                selected
                                  ? current.filter((id) => id !== group.id)
                                  : [...current, group.id],
                              );
                              if (selected)
                                setLedGroupIds((current) =>
                                  current.filter((id) => id !== group.id),
                                );
                            }}
                          >
                            <span>
                              <span className="block text-sm font-semibold text-white">
                                {group.name}
                              </span>
                              <span className="block text-xs text-slate-500">
                                {(group.city_names ?? []).join(" · ") || "Sem cidades"}
                              </span>
                            </span>
                            {selected ? (
                              <Check className="h-4 w-4 text-amber-300" />
                            ) : (
                              <Plus className="h-4 w-4 text-slate-600" />
                            )}
                          </button>
                          {selected &&
                          data.access.canAdminister &&
                          ["leader", "manager", "director", "admin"].includes(role) ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLedGroupIds((current) =>
                                  leads
                                    ? current.filter((id) => id !== group.id)
                                    : [...current, group.id],
                                )
                              }
                              className={
                                "mt-3 w-full rounded-lg border px-2 py-1.5 text-xs " +
                                (leads
                                  ? "border-sky-400/40 bg-sky-400/10 text-sky-300"
                                  : "border-white/10 text-slate-400")
                              }
                            >
                              {leads ? "Responsável por este grupo" : "Marcar como líder do grupo"}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : departmentId !== "none" ? (
                <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
                  Ainda não existe grupo nesse setor. Crie um grupo para separar as cidades ou
                  lojas.
                </p>
              ) : null}
              {data.access.canAdminister &&
              departmentId !== "none" &&
              ["leader", "manager", "director", "admin"].includes(role) ? (
                <button
                  type="button"
                  onClick={() => setDepartmentResponsible((value) => !value)}
                  className={
                    "flex w-full items-center justify-between rounded-xl border p-3 text-left " +
                    (departmentResponsible
                      ? "border-emerald-400/40 bg-emerald-400/10"
                      : "border-white/10 bg-white/[.03]")
                  }
                >
                  <span>
                    <span className="block text-sm font-semibold text-white">
                      Responsável pelo setor
                    </span>
                    <span className="block text-xs text-slate-500">
                      Cada setor aceita até dois líderes ou supervisores.
                    </span>
                  </span>
                  {departmentResponsible ? <Check className="h-4 w-4 text-emerald-300" /> : null}
                </button>
              ) : null}
              <div className="space-y-2">
                <Label>Responde para</Label>
                <p className="text-xs text-slate-500">Pode marcar mais de um líder.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {possibleLeaders.map((leader) => {
                    const selected = leaderPersonIds.includes(leader.id);
                    return (
                      <button
                        key={leader.id}
                        type="button"
                        onClick={() =>
                          setLeaderPersonIds((current) =>
                            selected
                              ? current.filter((id) => id !== leader.id)
                              : [...current, leader.id],
                          )
                        }
                        className={
                          "flex items-center justify-between rounded-xl border p-3 text-left transition " +
                          (selected
                            ? "border-amber-300/50 bg-amber-300/10"
                            : "border-white/10 bg-white/[.03]")
                        }
                      >
                        <span>
                          <span className="block text-sm font-semibold text-white">
                            {leader.full_name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {leader.position_title}
                          </span>
                        </span>
                        {selected ? (
                          <Check className="h-4 w-4 text-amber-300" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="acesso" className="space-y-4 pt-3">
              {!editingId ? (
                <Card className="border-dashed border-white/10 bg-white/[.02]">
                  <CardContent className="p-6 text-center text-sm text-slate-400">
                    Salve o cadastro primeiro para liberar login e senha.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="border-white/10 bg-white/[.03]">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-3">
                        <KeyRound className="h-5 w-5 text-amber-300" />
                        <div>
                          <p className="font-semibold text-white">Login interno do Postit!</p>
                          <p className="text-xs text-slate-500">
                            {selectedAccount
                              ? "Login ativo: " + selectedAccount.login
                              : selectedPerson?.user_id
                                ? "Conta vinculada, sem login interno."
                                : "Ainda sem conta de acesso."}
                          </p>
                        </div>
                      </div>
                      {data.access.canAdminister ? (
                        selectedAccount ? (
                          <Button
                            variant="outline"
                            onClick={() => resetCredential.mutate()}
                            disabled={resetCredential.isPending}
                          >
                            Gerar nova senha temporária
                          </Button>
                        ) : (
                          <Button
                            onClick={() => issueCredential.mutate()}
                            disabled={issueCredential.isPending || !editingId}
                          >
                            Criar login e senha temporária
                          </Button>
                        )
                      ) : (
                        <p className="text-xs text-slate-500">
                          Somente a administração pode criar ou redefinir senhas.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  {issuedCredential ? (
                    <Card className="border-emerald-400/30 bg-emerald-400/10">
                      <CardContent className="space-y-3 p-5">
                        <p className="text-sm font-semibold text-emerald-200">
                          Entregue estes dados agora
                        </p>
                        <div className="rounded-lg bg-black/30 p-3 font-mono text-sm text-white">
                          <p>Login: {issuedCredential.login}</p>
                          <p>Senha: {issuedCredential.password}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={copyCredential}>
                          <Copy className="mr-2 h-4 w-4" /> Copiar acesso
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}
                  <Card className="border-sky-400/20 bg-sky-400/5">
                    <CardContent className="p-5 text-sm text-slate-300">
                      Depois do primeiro login e da troca de senha, a própria pessoa pode abrir
                      <strong> Minha conta</strong> no Postit! e vincular o Google dela.
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPersonOpen(false);
                resetPersonForm();
              }}
            >
              Cancelar
            </Button>
            {personTab === "dados" ? (
              <Button onClick={() => savePerson.mutate()} disabled={savePerson.isPending}>
                Salvar pessoa
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-[.18em] text-slate-500">
          Setores e grupos
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.departments
            .filter((department) => department.active)
            .map((department) => {
              const leaders = data.departmentLeaders
                .filter((row) => row.department_id === department.id)
                .map((row) => data.people.find((person) => person.id === row.person_id))
                .filter(Boolean);
              const groups = data.groups.filter(
                (group) => group.active && group.department_id === department.id,
              );
              return (
                <Card key={department.id} className="border-white/10 bg-slate-950/55">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-11 w-2 rounded-full"
                        style={{ backgroundColor: department.color }}
                      />
                      <div>
                        <p className="font-semibold text-white">{department.name}</p>
                        <p className="text-xs text-slate-500">
                          Responsáveis:{" "}
                          {leaders.length
                            ? leaders.map((leader) => leader.full_name).join(" e ")
                            : "não definidos"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {groups.length ? (
                        groups.map((group) => {
                          const groupLeaders = data.personGroups
                            .filter((row) => row.group_id === group.id && row.is_leader)
                            .map((row) => data.people.find((person) => person.id === row.person_id))
                            .filter(Boolean);
                          return (
                            <div
                              key={group.id}
                              className="rounded-xl border border-white/10 bg-white/[.03] p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-200">
                                    {group.name}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    <MapPin className="mr-1 inline h-3 w-3" />
                                    {(group.city_names ?? []).join(" · ") || "Sem cidades"}
                                  </p>
                                </div>
                                <Badge className="border-white/10 bg-white/5 text-slate-400">
                                  {groupLeaders.length}/2 líderes
                                </Badge>
                              </div>
                              {groupLeaders.length ? (
                                <p className="mt-2 text-xs text-sky-300">
                                  {groupLeaders.map((leader) => leader.full_name).join(" e ")}
                                </p>
                              ) : null}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-600">Nenhum grupo criado.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </section>

      {data.access.canAdminister && data.visibilityGrants.some((grant) => grant.active) ? (
        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-[.18em] text-slate-500">
            Coberturas temporárias
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {data.visibilityGrants
              .filter((grant) => grant.active)
              .map((grant) => {
                const person = data.people.find((row) => row.id === grant.grantee_person_id);
                const group = data.groups.find((row) => row.id === grant.group_id);
                return (
                  <Card key={grant.id} className="border-sky-400/20 bg-sky-400/5">
                    <CardContent className="flex items-start justify-between gap-3 p-4">
                      <div>
                        <p className="font-semibold text-white">
                          {person?.full_name || "Pessoa"} → {group?.name || "Grupo"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{grant.reason}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(grant.starts_at)} até{" "}
                          {grant.ends_at ? formatDateTime(grant.ends_at) : "sem término"}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => endCoverage.mutate(grant)}>
                        Encerrar
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-[.18em] text-slate-500">
          Pessoas
        </h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.people
            .filter((person) => person.active)
            .map((person) => {
              const department = data.departments.find((row) => row.id === person.department_id);
              const memberships = data.personGroups.filter((row) => row.person_id === person.id);
              const leaders = data.reportingLines
                .filter((line) => line.subordinate_person_id === person.id)
                .map(
                  (line) => data.people.find((row) => row.id === line.leader_person_id)?.full_name,
                )
                .filter(Boolean);
              return (
                <button
                  key={person.id}
                  type="button"
                  disabled={!canEditPerson(person.id)}
                  onClick={() => editPerson(person)}
                  className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 text-left transition hover:border-amber-300/30 disabled:cursor-default disabled:hover:border-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{person.full_name}</p>
                      <p className="text-xs text-slate-500">{person.position_title}</p>
                    </div>
                    <Badge className="border-white/10 bg-white/5 text-slate-400">
                      {ROLE_LABELS[person.role as PostitMemberRole]}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    {department?.name || "Sem setor"} ·{" "}
                    {(person.city_names ?? []).join(", ") || "sem cidades"}
                  </p>
                  {memberships.length ? (
                    <p className="mt-1 text-xs text-sky-300">
                      {memberships
                        .map(
                          (membership) =>
                            data.groups.find((group) => group.id === membership.group_id)?.name,
                        )
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-600">
                    Responde para: {leaders.length ? leaders.join(" e ") : "não definido"}
                  </p>
                </button>
              );
            })}
        </div>
      </section>
    </div>
  );
}

function NotificationsPanel({
  data,
  refresh,
  openItem,
}: {
  data: PostitWorkspace;
  refresh: () => void;
  openItem: (id: string) => void;
}) {
  const markRead = useMutation({
    mutationFn: () => markPostitNotificationsRead(),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const unread = data.notifications.filter((notification) => !notification.read_at).length;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
            Central de avisos
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">Suas notificações</h2>
        </div>
        {unread > 0 ? (
          <Button
            variant="outline"
            className="border-white/10"
            onClick={() => markRead.mutate()}
            disabled={markRead.isPending}
          >
            <Check className="mr-2 h-4 w-4" /> Marcar como lidas
          </Button>
        ) : null}
      </div>
      {data.notifications.length ? (
        <div className="space-y-2">
          {data.notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition hover:border-amber-300/30 ${notification.read_at ? "border-white/5 bg-white/[.02]" : "border-amber-300/20 bg-amber-300/[.05]"}`}
              onClick={() => notification.postit_id && openItem(notification.postit_id)}
            >
              <span
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.read_at ? "bg-slate-700" : "bg-amber-300"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{notification.title}</p>
                <p className="mt-1 text-sm text-slate-400">{notification.message}</p>
                <p className="mt-2 text-xs text-slate-600">
                  {formatDateTime(notification.created_at)}
                </p>
              </div>
              {notification.postit_id ? (
                <ChevronRight className="mt-2 h-4 w-4 text-slate-600" />
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma notificação"
          description="Atribuições, vencimentos e validações aparecerão aqui."
        />
      )}
    </div>
  );
}

function PostitDetailDialog({
  item,
  open,
  onOpenChange,
  data,
  refresh,
}: {
  item: PostitItemRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PostitWorkspace;
  refresh: () => void;
}) {
  const [mode, setMode] = useState<"none" | "extend" | "complete" | "reject">("none");
  const [newDueDate, setNewDueDate] = useState(defaultDueDate());
  const [reason, setReason] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [comment, setComment] = useState("");
  const done = () => {
    setMode("none");
    setReason("");
    setCompletionNote("");
    refresh();
  };
  const actionError = (error: Error) => toast.error(error.message);
  const itemId = () => {
    if (!item) throw new Error("Post-it não encontrado.");
    return item.id;
  };
  const start = useMutation({
    mutationFn: () => startPostitItem({ data: { postitId: itemId() } }),
    onSuccess: () => {
      toast.success("Post-it colocado em andamento.");
      done();
    },
    onError: actionError,
  });
  const extend = useMutation({
    mutationFn: () => extendPostitDeadline({ data: { postitId: itemId(), newDueDate, reason } }),
    onSuccess: () => {
      toast.success("Novo prazo registrado no histórico.");
      done();
    },
    onError: actionError,
  });
  const submit = useMutation({
    mutationFn: () =>
      submitPostitCompletion({ data: { postitId: itemId(), note: completionNote, evidenceUrl } }),
    onSuccess: () => {
      toast.success("Conclusão enviada para validação.");
      done();
    },
    onError: actionError,
  });
  const validate = useMutation({
    mutationFn: (approved: boolean) =>
      validatePostitCompletion({ data: { postitId: itemId(), approved, note: reason } }),
    onSuccess: (_, approved) => {
      toast.success(approved ? "Conclusão aprovada." : "Post-it devolvido ao responsável.");
      done();
    },
    onError: actionError,
  });
  const addComment = useMutation({
    mutationFn: () => addPostitComment({ data: { postitId: itemId(), body: comment } }),
    onSuccess: () => {
      setComment("");
      refresh();
    },
    onError: actionError,
  });
  if (!item) return null;
  const deadlines = data.deadlines.filter((deadline) => deadline.postit_id === item.id);
  const comments = data.comments.filter((row) => row.postit_id === item.id);
  const currentPersonIsAssignee = Boolean(
    data.access.personId && itemAssigneeIds(data, item.id).includes(data.access.personId),
  );
  const currentPersonManagesGroup = Boolean(
    item.group_id &&
    data.access.personId &&
    (data.personGroups.some(
      (row) =>
        row.group_id === item.group_id && row.person_id === data.access.personId && row.is_leader,
    ) ||
      data.visibilityGrants.some(
        (row) =>
          row.group_id === item.group_id &&
          row.grantee_person_id === data.access.personId &&
          row.active &&
          (!row.ends_at || row.ends_at > new Date().toISOString()),
      )),
  );
  const canOperate =
    data.access.canAdminister ||
    currentPersonIsAssignee ||
    currentPersonManagesGroup ||
    [item.creator_user_id, item.manager_user_id].includes(data.currentUserId) ||
    (data.access.personId &&
      [item.creator_person_id, item.manager_person_id].includes(data.access.personId));
  const canValidate =
    data.access.canAdminister ||
    currentPersonManagesGroup ||
    item.creator_user_id === data.currentUserId ||
    item.manager_user_id === data.currentUserId ||
    (data.access.personId &&
      [item.creator_person_id, item.manager_person_id].includes(data.access.personId));
  const status = POSTIT_STATUS[item.status as PostitStatus];

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setMode("none");
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[94vh] overflow-y-auto border-amber-300/20 bg-slate-950 sm:max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/10 font-mono text-slate-300">
              {item.code}
            </Badge>
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
            <Badge variant="outline" className="border-white/10 text-slate-300">
              Prioridade {PRIORITY_LABELS[item.priority]}
            </Badge>
          </div>
          <DialogTitle className="pt-2 text-2xl text-white">{item.title}</DialogTitle>
          <DialogDescription>{item.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailInfo
            icon={UserRound}
            label="Responsáveis"
            value={itemAssigneeNames(data, item.id)}
          />
          <DetailInfo
            icon={Building2}
            label="Setor"
            value={departmentName(data, item.department_id)}
          />
          <DetailInfo
            icon={CalendarDays}
            label="Prazo atual"
            value={`${formatDate(item.current_due_date)} · data ${Number(item.extension_count) + 1}/3`}
          />
        </div>
        {item.status === "escalated" ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4">
            <p className="flex items-center gap-2 font-semibold text-rose-200">
              <AlertTriangle className="h-4 w-4" /> Escalado para{" "}
              {item.manager_person_id ? personName(data, item.manager_person_id) : "a gestão"}
            </p>
            <p className="mt-1 text-sm text-rose-200/70">
              Os três prazos foram esgotados sem conclusão validada.
            </p>
          </div>
        ) : null}
        {item.completion_note ? (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-300">
              Conclusão informada
            </p>
            <p className="mt-2 text-sm text-slate-300">{item.completion_note}</p>
            {item.completion_evidence_url ? (
              <a
                href={item.completion_evidence_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-sky-300 underline"
              >
                Abrir evidência
              </a>
            ) : null}
          </div>
        ) : null}
        {canOperate && ["open", "overdue"].includes(item.status) ? (
          <Button
            variant="outline"
            className="w-fit border-white/10"
            onClick={() => start.mutate()}
            disabled={start.isPending}
          >
            <CircleDot className="mr-2 h-4 w-4" /> Iniciar andamento
          </Button>
        ) : null}
        {canOperate && !["completed", "cancelled", "awaiting_validation"].includes(item.status) ? (
          <div className="flex flex-wrap gap-2">
            {Number(item.extension_count) < 2 ? (
              <Button
                variant="outline"
                className="border-white/10"
                onClick={() => setMode(mode === "extend" ? "none" : "extend")}
              >
                <Clock3 className="mr-2 h-4 w-4" /> Nova data ({2 - Number(item.extension_count)}{" "}
                restante{2 - Number(item.extension_count) === 1 ? "" : "s"})
              </Button>
            ) : null}
            <Button
              className="bg-emerald-500 text-white hover:bg-emerald-400"
              onClick={() => setMode(mode === "complete" ? "none" : "complete")}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Enviar conclusão
            </Button>
          </div>
        ) : null}
        {mode === "extend" ? (
          <ActionBox title="Registrar nova data">
            <div className="grid gap-3 sm:grid-cols-[.45fr_1fr]">
              <div className="space-y-1.5">
                <Label>Nova data</Label>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(event) => setNewDueDate(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Justificativa obrigatória</Label>
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Por que o prazo precisa mudar?"
                />
              </div>
            </div>
            <Button size="sm" onClick={() => extend.mutate()} disabled={extend.isPending}>
              Confirmar nova data
            </Button>
          </ActionBox>
        ) : null}
        {mode === "complete" ? (
          <ActionBox title="Enviar para validação">
            <div className="space-y-1.5">
              <Label>O que foi realizado?</Label>
              <Textarea
                value={completionNote}
                onChange={(event) => setCompletionNote(event.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link da evidência (opcional)</Label>
              <Input
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-400"
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
            >
              Enviar conclusão
            </Button>
          </ActionBox>
        ) : null}
        {item.status === "awaiting_validation" && canValidate ? (
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-emerald-500 hover:bg-emerald-400"
              onClick={() => validate.mutate(true)}
              disabled={validate.isPending}
            >
              <Check className="mr-2 h-4 w-4" /> Aprovar conclusão
            </Button>
            <Button
              variant="destructive"
              onClick={() => setMode(mode === "reject" ? "none" : "reject")}
            >
              <X className="mr-2 h-4 w-4" /> Devolver
            </Button>
          </div>
        ) : null}
        {mode === "reject" ? (
          <ActionBox title="Devolver ao responsável">
            <div className="space-y-1.5">
              <Label>O que precisa ser corrigido?</Label>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
              />
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => validate.mutate(false)}
              disabled={validate.isPending}
            >
              Confirmar devolução
            </Button>
          </ActionBox>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <History className="h-4 w-4 text-amber-300" /> Histórico de prazos
            </h3>
            <div className="mt-3 space-y-3">
              {deadlines.map((deadline) => (
                <div key={deadline.id} className="relative border-l border-white/10 pl-4">
                  <span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-amber-300" />
                  <p className="text-sm font-medium text-slate-200">
                    {deadline.sequence === 0
                      ? "Prazo inicial"
                      : `${deadline.sequence}ª prorrogação`}{" "}
                    · {formatDate(deadline.new_due_date)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{deadline.reason}</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    por {profileName(data, deadline.requested_by)} em{" "}
                    {formatDateTime(deadline.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <MessageSquareText className="h-4 w-4 text-sky-300" /> Comentários
            </h3>
            <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
              {comments.length ? (
                comments.map((row) => (
                  <div key={row.id} className="rounded-lg bg-white/5 p-3">
                    <p className="text-xs font-semibold text-slate-300">
                      {profileName(data, row.author_user_id)}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">{row.body}</p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      {formatDateTime(row.created_at)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">Nenhum comentário.</p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Adicionar atualização"
              />
              <Button
                size="icon"
                onClick={() => addComment.mutate()}
                disabled={!comment.trim() || addComment.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1.5 text-sm font-medium text-slate-200">{value}</p>
    </div>
  );
}
function ActionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-amber-300/20 bg-amber-300/[.04] p-4">
      <p className="text-sm font-bold text-amber-200">{title}</p>
      {children}
    </div>
  );
}
function profileName(data: PostitWorkspace, userId?: string | null) {
  if (!userId) return "—";
  const profile = data.profiles.find((row) => row.id === userId);
  return profile?.full_name?.trim() || profile?.email || "Usuário";
}
function personName(data: PostitWorkspace, personId?: string | null) {
  if (!personId) return "—";
  return data.people.find((row) => row.id === personId)?.full_name || "Pessoa";
}
function itemAssigneeIds(data: PostitWorkspace, postitId: string) {
  return data.assignees
    .filter((row) => row.postit_id === postitId)
    .sort((a, b) => Number(a.assignment_order) - Number(b.assignment_order))
    .map((row) => row.person_id as string);
}
function itemAssigneeNames(data: PostitWorkspace, postitId: string) {
  const names = itemAssigneeIds(data, postitId).map((personId) => personName(data, personId));
  return names.length ? names.join(" + ") : "Sem responsável";
}
function departmentName(data: PostitWorkspace, departmentId?: string | null) {
  if (!departmentId) return "Geral";
  return data.departments.find((row) => row.id === departmentId)?.name || "Setor";
}
function departmentColor(data: PostitWorkspace, departmentId?: string | null) {
  return data.departments.find((row) => row.id === departmentId)?.color || "#facc15";
}
