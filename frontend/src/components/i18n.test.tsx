import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { useT } from '@/lib/i18n'
import { LANGS } from '@/player/i18n'

import { I18nProvider, LanguageSwitcher } from './i18n'

function Probe() {
  const { t } = useT()
  return <p>{t('signOut')}</p>
}

it('starts in English and rerenders in Chinese when switched, remembering the choice', () => {
  render(
    <I18nProvider>
      <LanguageSwitcher />
      <Probe />
    </I18nProvider>,
  )
  expect(screen.getByText('Sign out')).toBeTruthy()
  expect(document.documentElement.lang).toBe('en')

  fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'zh' } })
  expect(screen.getByText('退出登录')).toBeTruthy()
  expect(screen.getByRole('combobox', { name: '语言' })).toBeTruthy()
  expect(document.documentElement.lang).toBe('zh-CN')
  expect(localStorage.getItem('backseatfin:lang')).toBe('zh')
})

it('offers every language and sets <html lang> for the new ones', () => {
  render(
    <I18nProvider>
      <LanguageSwitcher />
      <Probe />
    </I18nProvider>,
  )
  const select = screen.getByRole('combobox')
  expect(Array.from(select.querySelectorAll('option'), (o) => o.value)).toEqual([...LANGS])
  fireEvent.change(select, { target: { value: 'ja' } })
  expect(screen.getByText('ログアウト')).toBeTruthy()
  expect(document.documentElement.lang).toBe('ja')
})

it('picks up a saved choice', () => {
  localStorage.setItem('backseatfin:lang', 'zh')
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  )
  expect(screen.getByText('退出登录')).toBeTruthy()
})
