import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, onTestFinished } from 'vitest'
import LoginSecondFactor from './LoginSecondFactor.vue'
import LoginSecondFactorSetup from './LoginSecondFactorSetup.vue'

const setup = { secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Example:author?secret=JBSWY3DPEHPK3PXP&issuer=Example' }

describe('the second-factor code inputs', () => {
  it('send a time-based code typed with blanks or a hyphen as its six digits', async () => {
    const wrapper = await mountSuspended(LoginSecondFactor, { props: { busy: false, error: null } })
    onTestFinished(() => wrapper.unmount())

    await wrapper.find('input').setValue(' 123 456 ')
    await wrapper.find('form').trigger('submit')
    await wrapper.find('input').setValue('654-321')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([['123456'], ['654321']])
  })

  it('send a recovery code without the blanks and hyphens that group it', async () => {
    const wrapper = await mountSuspended(LoginSecondFactor, { props: { busy: false, error: null } })
    onTestFinished(() => wrapper.unmount())

    await wrapper.find('input').setValue('ABCDE-FGHIJ ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([['ABCDEFGHIJ']])
  })

  it('send the confirming code of a new factor typed with a blank as its six digits', async () => {
    const wrapper = await mountSuspended(LoginSecondFactorSetup, { props: { setup, busy: false, error: null } })
    onTestFinished(() => wrapper.unmount())

    await wrapper.find('input').setValue('123 456')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([['123456']])
  })
})
