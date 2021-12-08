/*
 * core: 核心方法
 * 1.刷新
 * 2.渲染GM DOM
 * 3.重置tbody
 */
import jTool from '@jTool';
import { isString, isFunction, isArray, getStyle, rootDocument } from '@jTool/utils';
import { showLoading, hideLoading, getDiv, setLineHeightValue, calcLayout, clearTargetEvent, getTable, getWrap, getQuerySelector, getTbody } from '@common/base';
import { cloneObject, outError } from '@common/utils';
import {
	getTableData,
	setTableData,
	formatTableData,
	setCheckedData,
	getSettings,
	setSettings,
	SIV_waitContainerAvailable,
	getRowData
} from '@common/cache';
import { EMPTY_DATA_CLASS_NAME, TABLE_BODY_KEY, TABLE_HEAD_KEY, TABLE_PURE_LIST, TD_FOCUS, TR_CACHE_KEY, WRAP_KEY } from '@common/constants';
import { sendCompile, clearCompileList } from '@common/framework';
import { clearMenuDOM } from '@module/menu/tool';
import ajaxPage from '@module/ajaxPage';
import { resetCheckboxDOM } from '@module/checkbox';
import scroll from '@module/scroll';
import { tooltip } from '@module/remind';
import template from './template';
import { renderEmptyTbody, renderTbody, renderThead } from './render';
import { transformToPromise, diffTableData } from './tool';
import { getEvent, eventMap } from './event';
import { EVENTS, SELECTOR, TARGET } from '@common/events';
import { SettingObj, JTool, Row } from 'typings/types';
import './style.less';

const bindTrAndTdEvent = (_: string):void => {
	const { rowHover, rowClick, cellHover, cellClick, useCellFocus } = getSettings(_);

	eventMap[_] = getEvent(getQuerySelector(_));
	const event = eventMap[_];

	// 行事件透出参数
	const getRowParams = (tr: HTMLTableRowElement) => {
		return [
			// row
			getRowData(_, tr),

			// rowIndex
			parseInt(tr.getAttribute(TR_CACHE_KEY), 10)
		];
	};

	// 行事件: hover
	rowHover && (() => {
		let hoverTr: HTMLTableElement;
		const rowHoverEvent = event.rowHover;
		jTool(rowHoverEvent[TARGET]).on(rowHoverEvent[EVENTS], rowHoverEvent[SELECTOR], function () {
			// 防止hover在同一个行内多次触发
			if (hoverTr === this) {
				return;
			}
			hoverTr = this;
			tooltip(_, this, rowHover(...getRowParams(this), this), () => {
				hoverTr = null;
			});
		});

	})();

	// 行事件: click
	rowClick && (() => {
		const rowClickEvent = event.rowClick;
		jTool(rowClickEvent[TARGET]).on(rowClickEvent[EVENTS], rowClickEvent[SELECTOR], function () {
			tooltip(_, this, rowClick(...getRowParams(this), this));
		});
	})();

	// 单元格透出参数
	const getCellParams = (td: HTMLTableCellElement) => {
		const tr = td.parentNode as HTMLTableRowElement;
		return [
			// row
			getRowData(_, tr),

			// rowIndex
			parseInt(tr.getAttribute(TR_CACHE_KEY), 10),

			// colIndex
			td.cellIndex
		];
	};

	// 单元格事件: hover
	cellHover && (() => {
		let hoverTd: HTMLTableCellElement;
		const cellHoverEvent = event.cellHover;
		jTool(cellHoverEvent[TARGET]).on(cellHoverEvent[EVENTS], cellHoverEvent[SELECTOR], function () {
			// 防止hover在同一个单元格内多次触发
			if (hoverTd === this) {
				return;
			}
			hoverTd = this;
			tooltip(_, this, cellHover(...getCellParams(hoverTd), this), () => {
				hoverTd = null;
			});
		});
	})();

	// 单元格事件: click
	cellClick && (() => {
		const cellClickEvent = event.cellClick;
		jTool(cellClickEvent[TARGET]).on(cellClickEvent[EVENTS], cellClickEvent[SELECTOR], function () {
			tooltip(_, this, cellClick(...getCellParams(this), this));
		});
	})();

	// 单元格触焦事件: mousedown
	useCellFocus && (() => {
		const cellFocusEvent = event.cellFocus;
		jTool(cellFocusEvent[TARGET]).on(cellFocusEvent[EVENTS], cellFocusEvent[SELECTOR], function () {
			getTbody(_).find(`[${TD_FOCUS}]`).removeAttr(TD_FOCUS);
			this.setAttribute(TD_FOCUS, '');
		});
	})();
};

class Core {
    /**
     * 刷新表格 使用现有参数重新获取数据，对表格数据区域进行渲染
     * @param _
     * @param callback
     * @private
     */
    refresh(_: string, callback?: any): void {
        const settings = getSettings(_);
        const { disableAutoLoading, loadingTemplate, ajaxBeforeSend, ajaxSuccess, ajaxError, ajaxComplete, checkboxConfig } = settings;

        // 禁用状态保持: 指定在刷新类操作时(搜索、刷新、分页、排序、过滤)，清除选中状态
        if (checkboxConfig.disableStateKeep) {
            setCheckedData(_, [], true);
        }

        // 更新刷新图标状态
        ajaxPage.updateRefreshIconState(_, true);

        !disableAutoLoading && showLoading(_, loadingTemplate);

        let ajaxPromise = transformToPromise(settings);

        ajaxBeforeSend(ajaxPromise);
        ajaxPromise.then((response: object) => {
            // 异步重新获取settings
            try {
                const settings = getSettings(_);
                // setTimeout的作用: 当数据量过大时，用于保证表头提前显示
                setTimeout(() => {
                    this.driveDomForSuccessAfter(settings, response, callback);
                    ajaxSuccess(response);
                    ajaxComplete(response);
                    !disableAutoLoading && hideLoading(_);
                    ajaxPage.updateRefreshIconState(_, false);
                });
            } catch (e) {
                console.error(e);
            }
        })
        .catch((error: Error) => {
            ajaxError(error);
            ajaxComplete(error);
            !disableAutoLoading && hideLoading(_);
            ajaxPage.updateRefreshIconState(_, false);
        });
    }

	/**
	 * tableData数据变更处理函数
	 * @param _
	 * @param list
	 * @param useFormat
	 */
	async changeTableData(_: string, list: Array<Row>, useFormat?: boolean) {
		const settings = getSettings(_);
    	if (list.length === 0) {
			renderEmptyTbody(settings);
			setTableData(_, []);
			return;
		}
    	const oldTableData = getTableData(_);
    	const newTableData = useFormat ? formatTableData(_, list) : list;
		const diffData = diffTableData(settings, oldTableData, newTableData);

		// 存储选中数据
		setCheckedData(_, newTableData);

		// 存储数据
		setTableData(_, newTableData);

		// 触发渲染
		await renderTbody(settings, diffData);
	}

	/**
     * 执行ajax成功后重新渲染DOM
     * @param settings
     * @param response
     * @param callback
     */
    async driveDomForSuccessAfter(settings: SettingObj, response: object | string, callback?: any): Promise<any> {
        const { _, rendered, responseHandler, supportCheckbox, supportAjaxPage, supportMenu, checkboxConfig, dataKey, totalsKey, useNoTotalsMode, asyncTotals } = settings;

        // 用于防止在填tbody时，实例已经被消毁的情况。
        if (!rendered) {
            return;
        }

        if (!response) {
            outError('response undefined！please check ajaxData');
            return;
        }

        let parseRes = isString(response) ? JSON.parse(response as string) : response;

        // 执行请求后执行程序, 通过该程序可以修改返回值格式
        parseRes = responseHandler(cloneObject(parseRes));

        let _data = parseRes[dataKey];
        let totals = parseRes[totalsKey];

        // 数据校验: 数据异常
        if (!_data || !isArray(_data)) {
            outError(`response.${dataKey} is not Array，please check dataKey`);
            return;
        }

        // 数据校验: 未使用无总条数模式 && 未使用异步总页 && 总条数无效时直接跳出
        if (supportAjaxPage && !useNoTotalsMode && !asyncTotals && isNaN(parseInt(totals, 10))) {
            outError(`response.${totalsKey} undefined，please check totalsKey`);
            return;
        }

        // 数据为空时
        if (_data.length === 0) {
			// renderEmptyTbody(settings);
            parseRes[totalsKey] = 0;
            // setTableData(_, []);
        } else {
            const $div = getDiv(_);
            $div.removeClass(EMPTY_DATA_CLASS_NAME);
            $div.scrollTop(0);
        }

        // 数据变更
		await this.changeTableData(_, _data, true);

        // 渲染选择框
        if (supportCheckbox) {
            resetCheckboxDOM(_, _data, checkboxConfig.useRadio, checkboxConfig.max);
        }

        // 渲染分页
        if (supportAjaxPage) {
            ajaxPage.resetPageData(settings, parseRes[totalsKey], _data.length);
        }

        // 右键菜单
        if (supportMenu) {
            clearMenuDOM(_);
        }

        isFunction(callback) ? callback(parseRes) : '';
    };

    /**
     * 渲染HTML，根据配置嵌入所需的事件源DOM
     * @param $table
     * @param settings
     * @returns {Promise<any>}
     */
    async createDOM($table: JTool, settings: SettingObj): Promise<any> {
        const { _, lineHeight, useWordBreak } = settings;

        // 创建DOM前 先清空框架解析列表
        clearCompileList(_);

		// add wrap div
		$table.wrap(template.getWrapTpl({ settings }), '.table-div');

		// append thead
		const thead = rootDocument.createElement('thead');
		thead.setAttribute(TABLE_HEAD_KEY, _);
		$table.append(thead);

		// append tbody
		const tbody = rootDocument.createElement('tbody');
		tbody.setAttribute(TABLE_BODY_KEY, _);
		// 根据参数增加td断字标识
		if (useWordBreak) {
			tbody.setAttribute('word-break', '');
		}
		$table.append(tbody);

		// 绑定事件
		bindTrAndTdEvent(_);

        setSettings(settings);

        // 等待容器可用
        await this.waitContainerAvailable(_);

        // render thead
		renderThead(settings);

		// 存储行高css变量
		setLineHeightValue(_, lineHeight);

		// 计算布局
		calcLayout(settings);

		// 初始化滚轴
        scroll.init(_);

        // 解析框架: thead区域
        await sendCompile(settings);
    }

    /**
     * 等待容器可用: 防止因容器的宽度不可用，而导致的列宽出错
     * @param _
     */
    waitContainerAvailable(_: string): Promise<void> {
        const tableWrap = rootDocument.querySelector(`[${WRAP_KEY}="${_}"]`);
        function isAvailable() {
            return getStyle(tableWrap, 'width') !== '100%';
        }
        if (isAvailable()) {
            return;
        }
        return new Promise(resolve => {
            SIV_waitContainerAvailable[_] = setInterval(() => {
                if (isAvailable()) {
                    clearInterval(SIV_waitContainerAvailable[_]);
                    SIV_waitContainerAvailable[_] = null;
                    resolve();
                }
            }, 50);
        });
    }

    /**
	 * 消毁
	 * @param _
	 */
	destroy(_: string): void {
		clearTargetEvent(eventMap[_]);

		try {
			const $table = getTable(_);
			const $tableWrap = getWrap(_);
			// DOM有可能在执行到这里时, 已经被框架中的消毁机制清除
			if (!$table.length || !$tableWrap.length) {
				return;
			}

			// 清除因为实例而修改的属性
			const table = $table.get(0);
			TABLE_PURE_LIST.forEach(item => {
				let itemProp = table['__' + item];
				itemProp ? $table.attr(item, itemProp) : $table.removeAttr(item);
				delete table['__' + item];
			});

			// 还原table
			$table.html('');
			$tableWrap.after($table);
			$tableWrap.remove();
		} catch (e) {
			// '在清除GridManager实例的过程时, table被移除'
		}
	}
}
export default new Core();
