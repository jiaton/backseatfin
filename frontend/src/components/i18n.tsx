import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { I18nContext, type I18n, translate, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { detectLang, LANG_NAMES, type Lang, LANGS, saveLang } from '@/player/i18n'

/** Holds the UI language for the admin app; the choice is saved under the same key as
 * the player's, and mirrored to <html lang>. */
export function I18nProvider({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? detectLang())

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  const value = useMemo<I18n>(
    () => ({
      lang,
      t: translate(lang),
      setLang: (next) => {
        saveLang(next)
        setLangState(next)
      },
    }),
    [lang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** Small native select for page headers. Each option is shown in its own language. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useT()
  return (
    <select
      aria-label={t('language')}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className={cn(
        'h-8 rounded-md border border-input bg-card px-2 text-sm text-card-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {LANG_NAMES[l]}
        </option>
      ))}
    </select>
  )
}
