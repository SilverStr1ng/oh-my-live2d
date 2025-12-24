import { ELEMENT_ID, generateGlobalStyle } from '../config/index.js';
import { DefaultOptions } from '../types/index.js';
import { createElement } from '../utils/index.js';

// 全局样式
export class GlobalStyle {
  styleSheet?: HTMLElement;
  constructor(private options: DefaultOptions) {}

  /**
   * 创建
   */
  create(): void {
    const el = document.getElementById(ELEMENT_ID.globalStyle);

    if (!el) {
      this.styleSheet = createElement({
        tagName: 'style',
        id: ELEMENT_ID.globalStyle,
        innerHtml: generateGlobalStyle(this.options.primaryColor)
      });
    }
  }

  /**
   * 挂载
   */
  mount(parentElement?: HTMLElement): void {
    console.log('[OML2D] GlobalStyle mount called', { parentElement: parentElement?.id });
    if (this.styleSheet) {
      (parentElement || document.head).append(this.styleSheet);
    }
  }

  initialize(parentElement?: HTMLElement): void {
    this.create();
    this.mount(parentElement);
    this.reloadStyleSheet();
  }
  initializeStyle(): void {
    this.reloadStyleSheet();
  }

  // 重载样式表
  reloadStyleSheet(): void {
    if (this.styleSheet) {
      this.styleSheet.innerHTML = generateGlobalStyle(this.options.primaryColor);
    }
  }
}
