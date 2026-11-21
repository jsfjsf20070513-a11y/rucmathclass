import { Component, createRef } from 'react'
import { connexionHalves } from '../lib/connexionTransition'
import { pageMotion } from '../lib/pageMotion'
import { paperSnapshot } from '../lib/paperSnapshot'

const detailBody = '.lec-stack, .cor-body'
const ready = '[data-page-ready="true"], .cor-body[aria-busy="false"]'

// 在 React 替换页面前留住当前画面。副本只作显示，不能接收点击或键盘焦点。
export default class PageTransition extends Component {
  current = createRef()
  sheet = createRef()
  stop = () => {}

  getSnapshotBeforeUpdate(previous) {
    const motion = pageMotion(previous, this.props)
    if (!motion) return null
    if (previous.userId && previous.userId !== this.props.userId && motion !== 'connexion-close') return null
    if (this.current.current.parentElement.classList.contains('paper-wait')) {
      // 慢页还没有出现就再次跳转时，保留眼前的画面，直到新目的页就绪。
      return { motion: 'hold', place: paperSnapshot(this.sheet.current.firstElementChild), top: this.sheet.current.getBoundingClientRect().top }
    }
    const page = this.current.current.firstElementChild
    if (!page || (motion === 'lec-retract' && !page.querySelector(detailBody))) return null
    const rising = motion === 'lec-retract' && page.querySelector(detailBody)?.getAnimations()
      .find((animation) => animation.animationName === 'lecRise')
    return { motion, place: paperSnapshot(page), top: page.getBoundingClientRect().top,
      reverseAt: rising ? rising.effect.getTiming().duration - rising.currentTime : 0 }
  }

  componentDidUpdate(previous, _, snapshot) {
    if (previous.visit === this.props.visit && previous.userId === this.props.userId && !snapshot) return
    this.stop()
    if (!snapshot) return
    const { motion, place, top } = snapshot
    const current = this.current.current
    const sheet = this.sheet.current
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches && current.querySelector(ready)) return
    const copy = place(sheet)
    sheet.style.top = Math.min(0, top) + 'px'
    const stage = current.parentElement
    stage.dataset.motion = motion
    stage.classList.add('paper-wait')
    let animated
    const observer = new MutationObserver(start)
    const stop = () => {
      observer.disconnect()
      media.removeEventListener('change', stop)
      animated?.removeEventListener('animationend', ended)
      animated?.removeEventListener('animationcancel', ended)
      animated?.classList.remove(motion)
      stage.classList.remove('paper-wait')
      delete stage.dataset.motion
      sheet.replaceChildren()
      this.stop = () => {}
    }
    const ended = (event) => { if (event.target === animated) stop() }
    function start() {
      if (current.querySelector('.page-status[role="alert"]')) { stop(); return }
      if (!current.querySelector(ready)) return
      if (media.matches || motion === 'hold') { stop(); return }
      observer.disconnect()
      stage.classList.remove('paper-wait')
      if (motion === 'connexion-open' || motion === 'connexion-close') {
        const opening = motion === 'connexion-open'
        const source = opening ? copy : current.firstElementChild
        const halves = [opening ? copy : paperSnapshot(source)(sheet), paperSnapshot(source)(sheet)]
        halves.forEach((half, index) => {
          half.style.clipPath = connexionHalves[index].clipPath
          half.style.setProperty('--half-open', connexionHalves[index].transform)
          half.classList.add(motion)
        })
        animated = halves[1]
      } else if (motion === 'lec-retract') animated = copy.querySelector(detailBody)
      else if (motion === 'lec-rise') animated = current.querySelector(detailBody)
      else animated = current.firstElementChild
      if (!animated) { stop(); return }
      animated.addEventListener('animationend', ended)
      animated.addEventListener('animationcancel', ended)
      animated.classList.add(motion)
      if (snapshot.reverseAt) {
        const retract = animated.getAnimations().find((animation) => animation.animationName === 'lecRise')
        if (retract) retract.currentTime = snapshot.reverseAt
      }
    }
    this.stop = stop
    media.addEventListener('change', stop)
    observer.observe(current, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-page-ready', 'aria-busy'] })
    start()
  }

  componentWillUnmount() { this.stop() }

  render() {
    return <div className="paper-stage">
      <div ref={this.current} className="paper-current">{this.props.children}</div>
      <div ref={this.sheet} className="paper-copy" aria-hidden="true" inert="" />
    </div>
  }
}
