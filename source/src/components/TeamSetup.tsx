import { Check, ChevronRight, Mail, MessageCircle, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar, Btn, PressScale, Sheet, toast } from '@/components/kit';
import { askForUsualWeek, resendInvite } from '@/lib/api';
import { C } from '@/lib/colors';
import { inviteMessage, shareInvite } from '@/lib/invite';
import { cardShadow } from '@/lib/motion';
import {
  STAGE_HINT,
  STAGE_LABEL,
  STAGE_ORDER,
  STAGE_TONE_OF,
  type SetupPerson,
  type SetupStage,
} from '@/lib/readiness';
import type { Channel } from '@/lib/types';

const STAGE_TONE = STAGE_TONE_OF;

export function StageChip({ stage }: { stage: SetupStage }) {
  const tone = STAGE_TONE[stage];
  return (
    <View className="self-start rounded-full px-2 py-0.5" style={{ backgroundColor: tone.bg }}>
      <Text className="text-[11px] font-semibold" style={{ color: tone.ink }}>
        {STAGE_LABEL[stage]}
      </Text>
    </View>
  );
}

/**
 * Where the whole team stands: how many can be scheduled, and who is stuck at which step.
 * Shown on Today and Team until everyone has a usual week.
 */
export function SetupCard({
  people,
  ready,
  total,
  onOpen,
}: {
  people: SetupPerson[];
  ready: number;
  total: number;
  /** Leave out where the screen already has the button. */
  onOpen?: () => void;
}) {
  const groups = STAGE_ORDER.map((stage) => ({
    stage,
    names: people.filter((p) => p.stage === stage).map((p) => p.emp.name),
  })).filter((g) => g.names.length > 0);
  const left = total - ready;
  return (
    <View
      className="rounded-2xl border border-border/60 bg-card p-4"
      style={[{ borderCurve: 'continuous' }, cardShadow]}
    >
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[15px] font-semibold text-foreground">
          {ready} of {total} ready to schedule
        </Text>
        {left > 0 ? <Text className="text-xs text-muted-foreground">{left} to go</Text> : null}
      </View>
      <View className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <View
          className="h-full rounded-full"
          style={{ width: `${total > 0 ? (ready / total) * 100 : 0}%`, backgroundColor: C.pine }}
        />
      </View>
      <View className="mt-3">
        {groups.map((g, i) => (
          <View
            key={g.stage}
            className={`flex-row items-start gap-3 py-2.5 ${i > 0 ? 'border-t border-border/70' : ''}`}
          >
            <View
              className="mt-0.5 h-6 min-w-6 items-center justify-center rounded-full px-1.5"
              style={{ backgroundColor: STAGE_TONE[g.stage].bg }}
            >
              <Text
                className="text-xs font-bold"
                style={{ color: STAGE_TONE[g.stage].ink, fontVariant: ['tabular-nums'] }}
              >
                {g.names.length}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground">{STAGE_LABEL[g.stage]}</Text>
              <Text className="text-xs leading-4 text-muted-foreground" numberOfLines={2}>
                {g.names.join(', ')}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {onOpen ? (
        <View className="mt-2">
          <Btn
            label="Invite and remind"
            onPress={onOpen}
            icon={<ChevronRight size={16} color={C.cream} />}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * One list, one button per person: the next thing that gets them ready. Not joined gets
 * their invite (by email when there is one, otherwise shared by text); joined gets asked
 * for their usual week.
 */
export function SetupSheet({
  visible,
  onClose,
  people,
  cafeId,
  cafeName,
  channel,
  onChanged,
  onReview,
}: {
  visible: boolean;
  onClose: () => void;
  people: SetupPerson[];
  cafeId: string;
  cafeName: string;
  channel: Channel;
  onChanged: () => Promise<void> | void;
  /** Opens the place where a waiting usual week is approved. */
  onReview?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const emailable = people.filter(
    (p) =>
      !done[p.emp.id] &&
      ((!p.emp.user_id && p.emp.email?.trim() && p.stage !== 'review') ||
        p.stage === 'needs_usual'),
  );

  const act = async (p: SetupPerson, how: 'email' | 'share' | 'ask'): Promise<boolean> => {
    setError('');
    try {
      if (how === 'ask') {
        await askForUsualWeek({ cafeId, employeeId: p.emp.id, channel });
        setDone((d) => ({ ...d, [p.emp.id]: 'Asked' }));
      } else if (how === 'email') {
        const ok = await resendInvite(p.emp.id);
        if (!ok) throw new Error(`${p.emp.name} has no email address. Share their invite instead.`);
        setDone((d) => ({ ...d, [p.emp.id]: 'Invite emailed' }));
      } else {
        const result = await shareInvite(inviteMessage(p.emp, cafeName || 'our café'));
        if (result === 'failed') {
          throw new Error(`Could not share. ${p.emp.name}'s invite code is ${p.emp.invite_code}.`);
        }
        if (result === 'copied') toast(`Invite for ${p.emp.name} copied. Paste it into a text.`);
        setDone((d) => ({ ...d, [p.emp.id]: result === 'copied' ? 'Copied' : 'Shared' }));
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
      return false;
    }
  };

  const one = async (p: SetupPerson, how: 'email' | 'share' | 'ask') => {
    setBusyId(`${p.emp.id}:${how}`);
    await act(p, how);
    setBusyId(null);
    await onChanged();
  };

  const all = async () => {
    setBusyId('all');
    let sent = 0;
    for (const p of emailable) {
      if (await act(p, p.stage === 'needs_usual' ? 'ask' : 'email')) sent += 1;
    }
    setBusyId(null);
    await onChanged();
    if (sent > 0) toast(`Sent to ${sent === 1 ? '1 person' : `${sent} people`}.`);
  };

  const noEmail = people.filter((p) => !p.emp.user_id && !p.emp.email?.trim());

  return (
    <Sheet visible={visible} onClose={onClose} title="Get your team ready">
      <View className="gap-3 pb-4">
        <Text className="text-sm leading-5 text-muted-foreground">
          Each person joins with their invite, then sends when they can usually work. You approve it
          once, and every week is drafted from it.
        </Text>

        {emailable.length > 1 ? (
          <Btn
            label={`Email all ${emailable.length} who can be reached`}
            loading={busyId === 'all'}
            disabled={busyId !== null && busyId !== 'all'}
            onPress={all}
            icon={<Mail size={16} color={C.cream} />}
          />
        ) : null}

        <View>
          {people.map((p, i) => {
            const joined = Boolean(p.emp.user_id);
            const hasEmail = Boolean(p.emp.email?.trim());
            const state = done[p.emp.id];
            return (
              <View
                key={p.emp.id}
                className={`flex-row items-center gap-3 py-3 ${i > 0 ? 'border-t border-border/70' : ''}`}
              >
                <Avatar name={p.emp.name} size={38} />
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
                    {p.emp.name}
                  </Text>
                  <Text className="text-xs leading-4 text-muted-foreground">
                    {state
                      ? `${state} just now`
                      : p.stage === 'not_invited' && !hasEmail
                        ? 'No email on file. Share the invite by text.'
                        : STAGE_HINT[p.stage]}
                  </Text>
                </View>
                {state ? (
                  <View className="flex-row items-center gap-1 px-1">
                    <Check size={15} color={C.soloInk} />
                    <Text className="text-xs font-semibold" style={{ color: C.soloInk }}>
                      Done
                    </Text>
                  </View>
                ) : p.stage === 'review' ? (
                  <Btn
                    label="Review"
                    size="sm"
                    full={false}
                    variant="secondary"
                    onPress={onReview}
                  />
                ) : joined ? (
                  <Btn
                    label="Ask"
                    size="sm"
                    full={false}
                    loading={busyId === `${p.emp.id}:ask`}
                    disabled={busyId !== null}
                    onPress={() => one(p, 'ask')}
                    icon={<MessageCircle size={14} color={C.cream} />}
                  />
                ) : (
                  <View className="flex-row items-center gap-1.5">
                    {hasEmail ? (
                      <Btn
                        label="Email"
                        size="sm"
                        full={false}
                        loading={busyId === `${p.emp.id}:email`}
                        disabled={busyId !== null}
                        onPress={() => one(p, 'email')}
                        icon={<Mail size={14} color={C.cream} />}
                      />
                    ) : null}
                    <PressScale
                      onPress={() => one(p, 'share')}
                      disabled={busyId !== null}
                      accessibilityLabel={`Share ${p.emp.name}'s invite`}
                      className={`flex-row items-center gap-1.5 rounded-xl px-3 py-2 ${
                        hasEmail ? 'border border-border bg-card' : 'bg-primary'
                      }`}
                    >
                      <Share2 size={14} color={hasEmail ? C.pine : C.cream} />
                      <Text
                        className={`text-xs font-semibold ${
                          hasEmail ? 'text-foreground' : 'text-primary-foreground'
                        }`}
                      >
                        Share
                      </Text>
                    </PressScale>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {error ? <Text className="text-xs text-destructive">{error}</Text> : null}

        <Text className="text-xs leading-4 text-muted-foreground">
          {noEmail.length > 0 ? 'Add an email in Team and the invite is sent for you. ' : ''}
          Know someone’s hours already? Set their usual week yourself in Team.
        </Text>
      </View>
    </Sheet>
  );
}
