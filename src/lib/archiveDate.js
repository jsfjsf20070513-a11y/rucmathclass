const formatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Shanghai',
})

export function archiveDate(date) {
  return formatter.format(new Date(date))
}
