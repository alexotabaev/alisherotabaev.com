/**
 * Файл отвечает за расчет расположения виджетов магазина ST100, ST110, T985 на странице
 * если виджеты включены и не имеют кастомных настроек расположения
 */

/**
 * @typedef {Object} tPosWidget
 * @property {number} widgetCount
 * @property {Array<tPosWidgets>} widgets
 * @property {Object<tPosWidgetRect>} widgetRect
 * @property {number} margin
 * @property {number} height
 */

/**
 * @typedef {Object} tPosWidgets
 * @property {boolean} widgetIsInit
 * @property {string} widgetDataInit
 * @property {HTMLDivElement} widget
 * @property {string} widgetClass
 * @property {string} widgetShowClass
 * @property {string} widgetId
 */

/**
 * @typedef {Object} tPosWidgetRect
 * @property {string} top
 * @property {string} right
 */

function t_posWidget__init() {
	const allRecords = document.getElementById('allrecords');
	if (allRecords.getAttribute('data-tilda-mode') === 'edit') return;

	const widgetCart = document.querySelector('.t706__carticon:not([class*="t-menuwidgeticons__button_hidden"])');
	const widgetWishlist = document.querySelector('.t1002__wishlisticon:not([class*="t-menuwidgeticons__button_hidden"])');
	const widgetSearch = document.querySelector('.t985__search-widget-button:not([class*="t-menuwidgeticons__button_hidden"])');
	const widgetMembers = window.tildaMembers || document.querySelector('script[src*="tilda-buyer-dashboard"]');

	if (!widgetCart && !widgetWishlist && !widgetSearch && !widgetMembers) return;

	// Устанавливаем верхний дефолтный отступ для виджетов в зависимости от наличия шапки
	const defaultWidgetTop = t_posWidget__getDefaultWidgetTop();
	t_posWidget__setDefaultCoordinates({ top: defaultWidgetTop });

	window.tPosWidget = {
		widgetCount: 0,
		widgets: [],
		widgetRect: {},
		margin: 20,
	};

	if (widgetCart) {
		t_posWidget__addWidget({
			widgetIsInit: false,
			widgetDataInit: 'tcart_initted',
			widget: widgetCart,
			widgetId: 't706-widget-style',
			widgetClass: 't706__carticon',
			widgetShowClass: 't706__carticon_showed',
		});
	}

	if (widgetWishlist) {
		t_posWidget__addWidget({
			widgetIsInit: false,
			widgetDataInit: 'twishlist_initted',
			widget: widgetWishlist,
			widgetId: 't1002-widget-style',
			widgetClass: 't1002__wishlisticon',
			widgetShowClass: 't1002__wishlisticon_showed',
		});
	}

	if (widgetSearch) {
		t_posWidget__addWidget({
			widgetIsInit: false,
			widgetDataInit: 'tsearchwidget_initted',
			widget: widgetSearch,
			widgetId: 't985-widget-style',
			widgetClass: 't985__search-widget-button',
			widgetShowClass: 't-search-widget__button_showed',
		});
	}

	if (tPosWidget.widgetCount < 2 && !widgetMembers) {
		window.tPosWidget = {};
		return;
	} else if (tPosWidget.widgetCount > 3) {
		tPosWidget.height = 60;
	}

	document.head.insertAdjacentHTML('beforeend', '<style>.t-pos-widget__hide { opacity: 0 !important; z-index: -1; }</style>');

	t_posWidget__updateStyleWidget();

	let initWidth = window.innerWidth;

	window.addEventListener(
		'resize',
		t_posWidget__debounce(function () {
			/**
			 * Определяем точки на которых будет происходить перерасчет виджетов,
			 * если экран изменился, но не перешел в одну из 2х оставшихся точек, то ничего не делаем
			 * Перерасчитываем для w > 960 | w <= 960 && w >= 640 | w < 640
			 * На данных точках происходит изменение размеров виджетов и их расположение,
			 * по этому после изменений требуется перерасчет, так как высота, расположение, могут повлиять на отображение
			 */
			if (
				(window.innerWidth <= 960 && initWidth > 960) ||
				(window.innerWidth > 960 && initWidth <= 960) ||
				(window.innerWidth >= 640 && initWidth <= 640) ||
				(window.innerWidth <= 640 && initWidth <= 960)
			) {
				initWidth = window.innerWidth;

				t_posWidget__updateStyleWidget();
			}
		})
	);
}

/**
 * Обновляет расположение виджетов
 */
function t_posWidget__updateStyleWidget() {
	if (!window.tPosWidget || !tPosWidget.widgetCount || tPosWidget.widgetCount < 2) return;

	const isMobile = window.innerWidth <= 960;

	t_posWidget__hideWidget();

	t_posWidget__checkWidgetsInit()
		.finally(function () {
			t_posWidget__showWidget();
		})
		.then(function () {
			tPosWidget.widgets.forEach(element => {
				t_posWidget__addStyleWidget(element, isMobile);
			});

			tPosWidget.widgetRect = {};
		});
}

/**
 * Добавляет стиль для виджета и удаляет старый
 * @param {object} element
 * @param {boolean} isMobile
 */
function t_posWidget__addStyleWidget(element, isMobile) {
	const widgetStyle = document.getElementById(element.widgetId);
	if (widgetStyle) widgetStyle.remove();

	const defaultWidgetTop = t_posWidget__getDefaultWidgetTop();
	const previousWidget = tPosWidget.widgetRect;
	let widgetRect = window.getComputedStyle(element.widget);
	let widgetRectTop = parseInt(widgetRect.top);
	let widgetRectRight = parseInt(widgetRect.right);
	let widgetRectHeight = parseInt(widgetRect.height);

	const objScroll = window.scrollBarWidthCompensator;

	/**
	 * Для фиксированных элементов устанавливается дополнительный отступ справа при удалении скролла со страницы
	 * необходимо вычесть размер скролла от позиции элемента справа
	 */
	if (objScroll && objScroll.isInited) {
		let scrollBarWidth = objScroll.scrollBarWidth;

		if (objScroll.scrollBarWidth === 0 && document.body.style.paddingRight) {
			scrollBarWidth = parseInt(document.body.style.paddingRight);
		}

		widgetRectRight = widgetRectRight - scrollBarWidth;
	}

	/**
	 * Если виджет имеет кастомное позиционирование или скрыт, его не обрабатываем
	 */

	if (
		(!element.widget.classList.contains(element.widgetShowClass) && widgetRect.display === 'none') ||
		widgetRectTop !== defaultWidgetTop ||
		(widgetRectRight !== 50 && widgetRectRight !== 20)
	)
		return;

	/**
	 * Виджет может быть скрыт при открытии попапа, по этому необходимо получить его высоту,
	 * для того, чтобы виджеты не перемещались, пока скрыт другой
	 */
	if (!widgetRectHeight && widgetRect.display === 'none') {
		element.widget.style.display = 'block';
		element.widget.style.opacity = 0;
		widgetRectHeight = parseInt(widgetRect.height);
		element.widget.style.display = '';
		element.widget.style.opacity = 1;
	}

	/**
	 * Если отсутствует позиция предыдущего элемента, значит это первый элемент, оставляем на текущей позиции
	 */
	if (!previousWidget.top) {
		t_posWidget__updateDataPositionWidget({
			top: widgetRectTop,
			right: widgetRectRight,
			height: widgetRectHeight,
		});
		return;
	}

	const rec = element.widget.closest('.t-rec');
	const recId = rec.id;
	const widgetTop = parseInt(previousWidget.top) + parseInt(previousWidget.height) + tPosWidget.margin;
	const widgetRight = parseInt(previousWidget.right);
	let htmlClass = `#${recId} .${element.widgetClass}`;
	let html = '';
	let style = '';

	style += htmlClass + '{';
	style += 'top:' + widgetTop + 'px;';
	style += 'right:' + widgetRight + 'px;';
	style += '}';

	html += '<style id="' + element.widgetId + '">';

	if (isMobile) {
		html += '@media screen and (max-width: 960px) {';
		html += style;
		html += '}';
	} else {
		html += '@media screen and (min-width: 961px) {';
		html += style;
		html += '}';
	}

	html += '</style>';

	rec.insertAdjacentHTML('beforeend', html);

	t_posWidget__updateDataPositionWidget({
		top: widgetTop,
		right: widgetRight,
		height: widgetRectHeight,
	});
}

/**
 * Записывает позицию предыдущего элемента для следующего
 * @param {object} widgetRect - координаты
 */
function t_posWidget__updateDataPositionWidget(widgetRect) {
	tPosWidget.widgetRect.top = widgetRect.top;
	tPosWidget.widgetRect.right = widgetRect.right;
	tPosWidget.widgetRect.height = widgetRect.height;
}

function t_posWidget__showWidget() {
	if (!tPosWidget.widgets) return;

	tPosWidget.widgets.forEach(element => {
		element.widget.classList.remove('t-pos-widget__hide');
	});
}

function t_posWidget__hideWidget() {
	if (!tPosWidget.widgets) return;

	tPosWidget.widgets.forEach(element => {
		element.widget.classList.add('t-pos-widget__hide');
	});
}

/**
 * Проверяет готовность всех виджетов на странице
 * @returns {Promise}
 */
function t_posWidget__checkWidgetsInit() {
	return new Promise((resolve, reject) => {
		const maxAttempts = 50;
		let attempts = 0;

		let widgets = t_posWidget__getIsAllWidgetsInit();
		if (widgets) return resolve();

		const intervalId = setInterval(function () {
			attempts++;

			widgets = t_posWidget__getIsAllWidgetsInit();

			if (widgets) {
				clearInterval(intervalId);
				return resolve();
			} else if (attempts >= maxAttempts) {
				clearInterval(intervalId);
				return reject();
			}
		}, 100);
	});
}

/**
 * Возвращает флаг готовности всех виджетов на странице
 * @returns {boolean}
 */
function t_posWidget__getIsAllWidgetsInit() {
	if (!tPosWidget.widgets) return false;

	tPosWidget.widgets.forEach(widget => {
		if (window[widget.widgetDataInit] && !widget.widgetIsInit) {
			widget.widgetIsInit = true;
		}
	});

	const widgets = tPosWidget.widgets.filter(widget => widget.widgetIsInit);

	return widgets.length === tPosWidget.widgetCount;
}

/**
 * Принимает и добавляет виджеты для обработки в массив
 * @param {*} widgetData
 * @param {boolean} isFirst - флаг добавить первым элементов
 */
function t_posWidget__addWidget(widgetData, isFirst) {
	tPosWidget.widgetCount = tPosWidget.widgetCount + 1;

	if (isFirst) {
		tPosWidget.widgets = [widgetData, ...tPosWidget.widgets];
	} else {
		tPosWidget.widgets.push(widgetData);
	}
}

function t_posWidget__debounce(callback) {
	let timeoutId;

	return function () {
		const args = Array.prototype.slice.call(arguments);
		clearTimeout(timeoutId);
		timeoutId = setTimeout(function () {
			callback.apply(null, args);
		}, 200);
	};
}

/**
 * Проверяет наличие шапки на странице
 * @returns {boolean} - true если на странице есть шапка
 */
function t_posWidget__hasHeader() {
	return !!document.getElementById('t-header');
}

/**
 * Возвращает значение по умолчанию для top виджета
 * @returns {number}
 */
function t_posWidget__getDefaultWidgetTop() {
	const hasHeader = t_posWidget__hasHeader();
	const defaultWidgetTop = hasHeader ? 100 : 50;
	return defaultWidgetTop;
}

/**
 * Добавляет или обновляет style-тег с заданным id и стилями
 * @param {string} styleId - id style-тега
 * @param {string} css - CSS-стили
 * @param {Element} parent - элемент, куда вставлять (обычно head или rec)
 */
function t_posWidget__addOrUpdateStyleTag(styleId, css) {
	let styleTag = document.getElementById(styleId);
	if (styleTag) {
		styleTag.innerHTML = css;
	} else {
		styleTag = document.createElement('style');
		styleTag.id = styleId;
		styleTag.innerHTML = css;
		document.body.appendChild(styleTag);
	}
}
/**
 * Устанавливает координаты по умолчанию для виджетов, переопределяет их стили
 * @param {{top?: number, right?: number}} options 
 */
function t_posWidget__setDefaultCoordinates({ top, right }) {
	const topCss = top ? `top: ${top}px;` : '';
	const rightCss = right ? `right: ${right}px;` : '';
	const css = `
		.t706__carticon:not([class*="t-menuwidgeticons__button_hidden"]),
		.t1002__wishlisticon:not([class*="t-menuwidgeticons__button_hidden"]),
		.t985__search-widget-button:not([class*="t-menuwidgeticons__button_hidden"]),
		.tlk-userbar {
			${topCss}
			${rightCss}
		}`;

	t_posWidget__addOrUpdateStyleTag('t-pos-widget-styles', css);
}


t_onReady(t_posWidget__init);
