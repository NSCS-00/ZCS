// 侧边栏响应式功能
document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('sidebar');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const overlay = document.getElementById('overlay');

    // 检测屏幕宽度并相应处理侧边栏
    function handleResize() {
        if (window.innerWidth <= 768) {
            // 移动端：隐藏侧边栏
            sidebar.classList.add('hidden');
            // 确保移动菜单按钮显示
            if (mobileMenuBtn) {
                mobileMenuBtn.style.display = 'flex';
            }
        } else {
            // 桌面端：显示侧边栏
            sidebar.classList.remove('hidden');
            // 隐藏移动菜单按钮
            if (mobileMenuBtn) {
                mobileMenuBtn.style.display = 'none';
            }
        }
    }

    // 初始化
    handleResize();

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);

    // 移动端打开侧边栏
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            sidebar.classList.remove('hidden');
            overlay.style.display = 'block';
            document.body.style.overflow = 'hidden'; // 防止背景滚动
        });
    }

    // 移动端关闭侧边栏
    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', function() {
            sidebar.classList.add('hidden');
            overlay.style.display = 'none';
            document.body.style.overflow = 'auto'; // 恢复背景滚动
        });
    }

    // 点击遮罩层关闭侧边栏
    if (overlay) {
        overlay.addEventListener('click', function() {
            sidebar.classList.add('hidden');
            overlay.style.display = 'none';
            document.body.style.overflow = 'auto'; // 恢复背景滚动
        });
    }

    // 为导航链接添加点击事件，移动端点击后关闭侧边栏
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                sidebar.classList.add('hidden');
                if (overlay) {
                    overlay.style.display = 'none';
                }
                document.body.style.overflow = 'auto'; // 恢复背景滚动
            }
        });
    });
});

// 主题管理器类
class ThemeManager {
    constructor() {
        this.currentTheme = this.getStoredTheme() || this.getSystemTheme();
        this.init();
    }

    // 初始化主题
    init() {
        this.applyTheme(this.currentTheme);
    }

    // 获取存储的主题
    getStoredTheme() {
        return localStorage.getItem('theme');
    }

    // 获取系统主题偏好
    getSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }
        return 'dark';
    }

    // 应用主题
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        this.currentTheme = theme;

        // 触发主题改变事件
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
    }

    // 切换主题
    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        return newTheme;
    }

    // 获取当前主题
    getCurrentTheme() {
        return this.currentTheme;
    }

    // 检查是否为深色模式
    isDark() {
        return this.currentTheme === 'dark';
    }

    // 检查是否为浅色模式
    isLight() {
        return this.currentTheme === 'light';
    }
}

// 创建全局主题管理器实例
window.themeManager = new ThemeManager();

// 显示成功或错误消息
document.addEventListener('DOMContentLoaded', function() {
    const statusElements = document.querySelectorAll('.status');
    statusElements.forEach(el => {
        if (el.textContent.trim() !== '') {
            el.style.display = 'block';
            // 3秒后自动隐藏
            setTimeout(() => {
                el.style.display = 'none';
            }, 3000);
        }
    });
});