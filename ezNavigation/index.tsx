import { ApplicationCommandInputType } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { classNameFactory, disableStyle, enableStyle } from "@api/Styles";
import definePlugin, { OptionType } from "@utils/types";
import { closeModal, ModalContent, ModalRoot, ModalSize, openModal } from "@utils/modal";
import type { ModalProps } from "@utils/modal";
import { findStoreLazy } from "@webpack";
import ErrorBoundary from "@components/ErrorBoundary";
import {
    ChannelStore,
    GuildChannelStore,
    GuildMemberStore,
    GuildRoleStore,
    GuildStore,
    NavigationRouter,
    React,
    SelectedChannelStore,
    SelectedGuildStore,
} from "@webpack/common";

import managedStyle from "./styles.css?managed";

const ChannelMemberStore = findStoreLazy("ChannelMemberStore") as any;

const cl = classNameFactory("vc-guildlisting-");

const CATEGORY_TYPE = 4;
const TEXT_TYPES = [0, 5];

const settings = definePluginSettings({
    enabledGuildIds: {
        type: OptionType.STRING,
        description: "Server IDs the header button shows in. Empty = all servers.",
        default: "1517653713018159225",
    },
    excludedCategoryIds: {
        type: OptionType.STRING,
        description: "Category IDs to exclude from the list (staff/infra). Comma/space separated.",
        default: [
            "1517662077202993264",
            "1517657855589613768",
            "1517653714024927312",
            "1517668547520762156",
            "1517866264708518028",
            "1517664888443633694",
            "1517678390285565992",
            "1517679401062367282",
            "1518978715424653412",
        ].join(", "),
    },
    excludedChannelIds: {
        type: OptionType.STRING,
        description: "Channel IDs to ignore entirely (not a Jump target, not counted). Comma/space separated.",
        default: "1518296565310292110",
    },
    generalMatch: {
        type: OptionType.STRING,
        description: "Channel-name substring to Jump to (falls back to first text channel).",
        default: "general",
    },
    rolePrefix: {
        type: OptionType.STRING,
        description: "Member count = members holding the role named <prefix><category name>, e.g. 'Guild Larper Technology LLC'.",
        default: "Guild ",
    },
    memberCountSource: {
        type: OptionType.SELECT,
        description: "How to count category members.",
        options: [
            { label: "Member list (accurate, only for loaded/hoisted roles)", value: "memberList", default: true },
            { label: "Cached members (fills more rows, may undercount)", value: "cached" },
            { label: "Off (hide member count)", value: "off" },
        ],
    },
});

interface GuildRecord {
    id: string;
    name: string;
    tag: string;
    order: number;
    memberCount: number | null;
    generalId?: string;
}

function parseIdSet(raw: string): Set<string> {
    return new Set(raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean));
}

function isEnabledGuild(guildId: string | null | undefined): boolean {
    if (!guildId) return false;
    const raw = settings.store.enabledGuildIds.trim();
    if (!raw) return true;
    return parseIdSet(raw).has(guildId);
}

function collectChannels(result: any): any[] {
    const out: any[] = [];
    if (!result) return out;
    for (const key of Object.keys(result)) {
        const v = (result as any)[key];
        if (Array.isArray(v)) for (const e of v) if (e?.channel) out.push(e.channel);
    }
    return out;
}

function makeTag(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.trim().slice(0, 2).toUpperCase();
}

function buildGroupCounts(guildId: string): Map<string, number> {
    const counts = new Map<string, number>();
    try {
        const channelId = SelectedChannelStore.getChannelId();
        const props = ChannelMemberStore?.getProps?.(guildId, channelId);
        for (const g of props?.groups ?? []) if (g?.id) counts.set(g.id, g.count);
    } catch { return counts; }
    return counts;
}

function countCachedRole(guildId: string, roleId: string): number {
    try {
        const members = GuildMemberStore.getMembers(guildId) ?? [];
        return members.filter((m: any) => m?.roles?.includes(roleId)).length;
    } catch { return 0; }
}

function memberCountFor(guildId: string, roleId: string | undefined, groups: Map<string, number>): number | null {
    if (!roleId) return null;
    switch (settings.store.memberCountSource) {
        case "off": return null;
        case "cached": return countCachedRole(guildId, roleId);
        default: return groups.has(roleId) ? groups.get(roleId)! : null;
    }
}

function getGuilds(guildId: string): GuildRecord[] {
    const excludedCats = parseIdSet(settings.store.excludedCategoryIds);
    const excludedChans = parseIdSet(settings.store.excludedChannelIds);
    const channels = collectChannels(GuildChannelStore.getChannels(guildId))
        .filter(c => !excludedChans.has(c.id));

    const catMap = new Map<string, any>();
    for (const c of channels) {
        if (c.type === CATEGORY_TYPE) catMap.set(c.id, c);
    }
    for (const c of channels) {
        if (c.parent_id && !catMap.has(c.parent_id)) {
            const p = ChannelStore.getChannel(c.parent_id);
            if (p && p.type === CATEGORY_TYPE) catMap.set(p.id, p);
        }
    }

    const prefix = settings.store.rolePrefix ?? "";
    const roleIdByName = new Map<string, string>();
    const roles = GuildRoleStore.getRolesSnapshot?.(guildId) ?? {};
    for (const r of Object.values<any>(roles)) roleIdByName.set(r.name, r.id);

    const groups = buildGroupCounts(guildId);
    const match = (settings.store.generalMatch || "general").toLowerCase();

    return [...catMap.values()]
        .filter(cat => !excludedCats.has(cat.id) && cat.id !== guildId && (cat.name || "").trim().toLowerCase() !== "uncategorized")
        .map((cat, i) => {
            const childMap = new Map<string, any>();
            for (const c of channels) if (c.parent_id === cat.id) childMap.set(c.id, c);
            const children = [...childMap.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            const texts = children.filter(c => TEXT_TYPES.includes(c.type));
            const general =
                texts.find(c => (c.name ?? "").toLowerCase().includes(match)) ??
                texts[0] ??
                children[0];
            const roleId = roleIdByName.get(prefix + cat.name);
            return {
                id: cat.id,
                name: cat.name,
                tag: makeTag(cat.name),
                order: typeof cat.position === "number" ? cat.position : i,
                memberCount: memberCountFor(guildId, roleId, groups),
                generalId: general?.id,
            };
        });
}

const ListingIcon = ({ size = 18 }: { size?: number; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="4" cy="6" r="1.6" /><rect x="8" y="4.7" width="12" height="2.6" rx="1.3" />
        <circle cx="4" cy="12" r="1.6" /><rect x="8" y="10.7" width="12" height="2.6" rx="1.3" />
        <circle cx="4" cy="18" r="1.6" /><rect x="8" y="16.7" width="12" height="2.6" rx="1.3" />
    </svg>
);

const SearchIcon = ({ size = 16 }: { size?: number; }) => (
    <svg className={cl("search-icon")} width={size} height={size} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
    </svg>
);

const CloseIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
);

const SORTS = [
    { key: "default", label: "Default" },
    { key: "name", label: "A–Z" },
] as const;
type SortKey = typeof SORTS[number]["key"];

function jumpToGuild(guildId: string, g: GuildRecord) {
    if (!g.generalId) return;
    const path = `/channels/${guildId}/${g.generalId}`;
    try {
        if ((NavigationRouter as any).transitionToGuild) {
            (NavigationRouter as any).transitionToGuild(guildId, g.generalId);
        } else {
            NavigationRouter.transitionTo(path);
        }
    } catch {
        NavigationRouter.transitionTo(path);
    }
}

function GuildListingModal({ modalProps, guildId }: { modalProps: ModalProps; guildId: string; }) {
    const all = React.useMemo(() => getGuilds(guildId), [guildId]);
    const serverName = GuildStore.getGuild(guildId)?.name ?? "this server";

    const [search, setSearch] = React.useState("");
    const [sortKey, setSortKey] = React.useState<SortKey>("default");
    const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q ? all.filter(g => g.name.toLowerCase().includes(q)) : all.slice();
        const dir = sortDir === "asc" ? 1 : -1;
        list.sort((a, b) => (sortKey === "name" ? a.name.localeCompare(b.name) : a.order - b.order) * dir);
        return list;
    }, [all, search, sortKey, sortDir]);

    const setSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
        else { setSortKey(key); setSortDir("asc"); }
    };
    const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <div className={cl("header")}>
                <div className={cl("header-icon")} style={{ color: "#fff" }}><ListingIcon size={20} /></div>
                <div className={cl("titlewrap")}>
                    <h2 className={cl("title")}>
                        EzNavigation
                        <span className={cl("count")}>{all.length}</span>
                    </h2>
                    <span className={cl("subtitle")}>Easily navigate between categories inside {serverName}</span>
                </div>
                <div className={cl("header-actions")}>
                    <div className={cl("header-divider")} />
                    <button onClick={() => modalProps.onClose()} aria-label="Close"><CloseIcon /></button>
                </div>
            </div>

            <ModalContent className={cl("content")}>
                <div className={cl("search")}>
                    <SearchIcon />
                    <input
                        className={cl("search-input")}
                        value={search}
                        spellCheck={false}
                        autoFocus
                        placeholder="Search categories…"
                        onChange={e => setSearch(e.currentTarget.value)}
                        onKeyDown={e => { if (e.key === "Escape") setSearch(""); }}
                    />
                    {search && <span className={cl("search-count")}>{filtered.length}/{all.length}</span>}
                </div>

                <div className={cl("list")}>
                    <div className={cl("list-head")}>
                        <span className={cl("list-label")}>Categories</span>
                        <div className={cl("sort")}>
                            <span className={cl("sort-title")}>Sort</span>
                            {SORTS.map(s => (
                                <button
                                    key={s.key}
                                    className={cl("sort-btn")}
                                    data-active={sortKey === s.key}
                                    onClick={() => setSort(s.key)}
                                >
                                    {s.label}{arrow(s.key)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {filtered.map(g => (
                        <div className={cl("entry")} key={g.id}>
                            <div className={cl("entry-left")}>
                                <div className={cl("avatar-fallback")}>{g.tag}</div>
                                <div className={cl("entry-info")}>
                                    <div className={cl("entry-name")}>{g.name}</div>
                                    {g.memberCount != null && (
                                        <span className={cl("entry-stats")}>
                                            {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                className={cl("join")}
                                disabled={!g.generalId}
                                onClick={() => { jumpToGuild(guildId, g); modalProps.onClose(); }}
                            >
                                Jump
                            </button>
                        </div>
                    ))}

                    {filtered.length === 0 && (
                        <div className={cl("empty")}>
                            <div className={cl("empty-icon")}><SearchIcon size={24} /></div>
                            <p>No categories match your search.</p>
                        </div>
                    )}
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

let modalKey: string | null = null;

function openGuildListing(guildId?: string | null) {
    const id = guildId ?? SelectedGuildStore.getGuildId();
    if (!id || !isEnabledGuild(id) || modalKey) return;
    modalKey = openModal(props => (
        <ErrorBoundary>
            <GuildListingModal modalProps={props} guildId={id} />
        </ErrorBoundary>
    ), { onCloseCallback: () => { modalKey = null; } });
}

function closeGuildListing() {
    if (!modalKey) return;
    closeModal(modalKey);
    modalKey = null;
}

function onAltKeyDown(e: KeyboardEvent) {
    if (e.code === "AltLeft" && !e.repeat) openGuildListing();
}

function onAltKeyUp(e: KeyboardEvent) {
    if (e.code === "AltLeft") closeGuildListing();
}

const HEADER_BTN_ID = "vc-guildlisting-header-btn";
const HEADER_BTN_HTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="4" cy="6" r="1.6"/><rect x="8" y="4.7" width="12" height="2.6" rx="1.3"/><circle cx="4" cy="12" r="1.6"/><rect x="8" y="10.7" width="12" height="2.6" rx="1.3"/><circle cx="4" cy="18" r="1.6"/><rect x="8" y="16.7" width="12" height="2.6" rx="1.3"/></svg>';

let headerObserver: MutationObserver | null = null;
let injectScheduled = false;

function injectHeaderButton() {
    const guildId = SelectedGuildStore.getGuildId();
    const header = document.querySelector<HTMLElement>(
        '[class*="headerContent_"]:has([class*="guildDropdown_"])'
    );
    if (!header) return;

    const existing = header.querySelector<HTMLElement>("#" + HEADER_BTN_ID);

    if (!isEnabledGuild(guildId)) { existing?.remove(); return; }
    if (existing) return;

    const btn = document.createElement("div");
    btn.id = HEADER_BTN_ID;
    btn.className = cl("header-btn");
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-label", "EzNavigation");
    btn.innerHTML = HEADER_BTN_HTML;
    btn.addEventListener("click", () => openGuildListing(SelectedGuildStore.getGuildId()));
    header.appendChild(btn);
}

function scheduleDom() {
    if (injectScheduled) return;
    injectScheduled = true;
    requestAnimationFrame(() => {
        injectScheduled = false;
        injectHeaderButton();
    });
}

function startObservers() {
    injectHeaderButton();
    headerObserver = new MutationObserver(scheduleDom);
    headerObserver.observe(document.body, { childList: true, subtree: true });
}

function stopObservers() {
    headerObserver?.disconnect();
    headerObserver = null;
    document.getElementById(HEADER_BTN_ID)?.remove();
}

export default definePlugin({
    name: "EzNavigation",
    description: "Dupers University: server-header button → searchable category directory with member counts, Jump to #general.",
    authors: [{ name: "statflame", id: 0n }],
    settings,

    commands: [
        {
            name: "categories",
            description: "Open the category listing",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: (_args, ctx) => {
                openGuildListing(ctx?.guild?.id);
            },
        },
    ],

    patches: [],

    start() {
        enableStyle(managedStyle);
        startObservers();
        document.addEventListener("keydown", onAltKeyDown);
        document.addEventListener("keyup", onAltKeyUp);
    },

    stop() {
        document.removeEventListener("keydown", onAltKeyDown);
        document.removeEventListener("keyup", onAltKeyUp);
        closeGuildListing();
        stopObservers();
        disableStyle(managedStyle);
    },
});
