export default {
	title: '横浜市立図書館　予約連絡',
	url: 'https://opac.lib.city.yokohama.lg.jp/winj/opac/top.do',
	login: {
		url: 'https://opac.lib.city.yokohama.lg.jp/winj/opac/login.do?dispatch=/opac/reserve-list.do',
		timeout: 45,
		cardSelector: '#usercd',
		passwordSelector: '#password',
		submitSelector: "input[name='submit_btn_login']",
	},
	reserve: {
		wrapSelector: '.list-book > li',
		typeSelector: '.link-image > b',
		titleSelector: '.title',
		availableSelector: '.icon-available',
	},
	calendar: {
		url: 'https://opac.lib.city.yokohama.lg.jp/winj/opac/calendar.do?submit_btn_reference=cal&cmb_ar=11',
		timeout: 30,
		cellSelector: '.calendar-area .hdg-lyt-calendar:first-child + table > tbody td',
	},
};