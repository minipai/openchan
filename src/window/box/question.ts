import { useState } from 'react'
import type { Asked } from '../../between/brain'

/**
 * Her question, while it is being answered.
 *
 * She can ask several things in one breath, and they are taken one at a time in
 * the order she asked them — so between the first answer and the last there is
 * a half-answered question, which is what this holds. The whole of it goes back
 * at once, when the last part has been picked: an answer to the first question
 * alone is not an answer to what she asked.
 *
 * What is kept is kept against the id she asked under, so the next thing she
 * asks starts from nothing however the last one was left. That alone is not
 * enough: the id is hers to choose and nothing stops her asking again under one
 * she has already used — so what was kept is let go of the moment it has been
 * handed back or turned down. Left there, a question asked a second time would
 * come up already answered, with every part of it picked and nothing to pick.
 */
export function useHerQuestion(
  asked: Asked | null,
  hand: {
    choose: (askId: string, answers: string[][]) => void
    decline: (askId: string) => void
  },
) {
  // What has been picked so far of a question she asked in several parts, and
  // which question it was picked for.
  const [picks, setPicks] = useState<{ of: string; answers: string[][] }>({ of: '', answers: [] })
  const answers = asked && picks.of === asked.askId ? picks.answers : []

  return {
    /** Which of her questions is up. */
    question: asked?.questions[answers.length] ?? null,
    /** How many of them have been answered, which is what makes each of them
     * its own list rather than the one before it with the ticks still on. */
    answered: answers.length,
    pick(labels: string[]) {
      const all = [...answers, labels]
      // The last one answered hands the whole of it back, and what was kept
      // for it is let go of — a question asked again under the same id is a
      // fresh question.
      if (all.length < asked!.questions.length) return setPicks({ of: asked!.askId, answers: all })
      setPicks({ of: '', answers: [] })
      hand.choose(asked!.askId, all)
    },
    /** She is waiting on this one, so it is not simply put away: she is told
     * that nobody is going to pick, which is not the same as being told that
     * nothing was picked. */
    nobodyWillPick() {
      setPicks({ of: '', answers: [] })
      hand.decline(asked!.askId)
    },
  }
}
