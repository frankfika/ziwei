/**
 * 应用级逻辑入口。
 *
 * AIUI 约定：app.json 定义「页面从哪进、界面怎么组织」，
 * app.js 定义「应用级生命周期与全局数据」。
 *
 * 这个智能体的全局状态很少 —— 命盘、解读、追问都是页面级的事，
 * 所以这里只做两件事：记录启动参数、把全局状态清干净。
 */
export default {
    onLaunch(options) {
        this.globalData = {
            /** 启动参数（可能带着生辰参数） */
            launchOptions: options || {},
            /** 应用版本，与 AGENTS.md / package.json 保持一致 */
            version: '1.0.0'
        };
    },

    onShow() {
        // 眼镜从后台回到前台：不需要特殊处理，页面自己会 onShow
    },

    onHide() {
        // 隐藏时停止播报，避免眼镜摘下后还在说话
        try {
            if (typeof speechSynthesis !== 'undefined' && typeof speechSynthesis.cancel === 'function') {
                speechSynthesis.cancel();
            }
        } catch (error) {
            /* 运行时没提供 speechSynthesis 时忽略 */
        }
    },

    onError(error) {
        console.error('[ziwei-agent] app error:', error && error.message ? error.message : error);
    }
};
