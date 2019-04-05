/**
 * 核心功能所需的事件项
 * @param gridManagerName
 * @param scope: querySelector 域
 */
export default function getCoreEvent(gridManagerName, scope) {
    return {
        // td移入
        tdMousemove: {eventName: 'mousemove', eventQuerySelector: `${scope} tbody td`}
    };
}
