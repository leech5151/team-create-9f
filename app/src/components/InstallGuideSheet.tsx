import { useState } from 'react';

interface Props {
  isIos: boolean;
  /** Name of the in-app browser the page is trapped in, or null. */
  inAppBrowser: string | null;
  onClose: () => void;
}

/**
 * How to install, where the browser gives us no dialog to open.
 *
 * iOS has no install API at all — `beforeinstallprompt` is Chromium-only — so
 * on an iPhone the button can never do the installing itself. A toast was too
 * short to follow: the steps are in the Share sheet, which means leaving the
 * page, so they have to stay on screen until dismissed.
 */
export function InstallGuideSheet({ isIos, inAppBrowser, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="sheetScrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="앱 설치 방법"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">홈 화면에 앱으로 추가</div>

        {inAppBrowser ? (
          /*
           * 인앱 브라우저에는 '홈 화면에 추가' 자체가 없다. 페이지에서 할 수
           * 있는 건 Safari 로 옮겨 가도록 링크를 쥐어주는 것뿐이다.
           */
          <>
            <div className="sheet__hint">
              지금 {inAppBrowser} 안에서 열려 있어요. 여기서는 홈 화면에 추가할 수 없습니다 —
              {isIos ? ' Safari' : ' 크롬'}으로 열어야 해요.
            </div>
            <ol className="guideSteps">
              <li>
                <span className="guideSteps__n">1</span>
                아래 <b>링크 복사</b>를 누르세요.
              </li>
              <li>
                <span className="guideSteps__n">2</span>
                {isIos ? 'Safari' : '크롬'}을 열고 주소창에 붙여넣어 이동합니다.
                <em>
                  {inAppBrowser} 오른쪽 아래 <b>···</b> 메뉴의 “다른 브라우저로 열기”를 써도
                  됩니다.
                </em>
              </li>
              <li>
                <span className="guideSteps__n">3</span>
                거기서 다시 <b>앱 설치</b>를 누르면 이 안내가 설치 방법으로 바뀝니다.
              </li>
            </ol>
          </>
        ) : isIos ? (
          <>
            <div className="sheet__hint">
              아이폰은 웹에서 바로 설치할 수 없어요. Safari 공유 메뉴를 거쳐야 합니다.
            </div>
            <ol className="guideSteps">
              <li>
                <span className="guideSteps__n">1</span>
                화면 아래 <b>공유</b> 버튼
                <span className="guideSteps__icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16">
                    <path d="M8 10.5V2M8 2 5 5M8 2l3 3" />
                    <path d="M3.5 8.5v4a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-4" />
                  </svg>
                </span>
                을 누릅니다.
                <em>주소창 오른쪽 또는 하단 가운데에 있어요.</em>
              </li>
              <li>
                <span className="guideSteps__n">2</span>
                목록을 내려 <b>홈 화면에 추가</b>를 고릅니다.
              </li>
              <li>
                <span className="guideSteps__n">3</span>
                오른쪽 위 <b>추가</b>를 누르면 끝이에요.
                <em>홈 화면 아이콘으로 열면 주소창 없이 앱처럼 실행됩니다.</em>
              </li>
            </ol>
          </>
        ) : (
          <>
            <div className="sheet__hint">
              이 브라우저는 설치 창을 띄울 수 없어요. 메뉴에서 직접 추가해 주세요.
            </div>
            <ol className="guideSteps">
              <li>
                <span className="guideSteps__n">1</span>
                브라우저 오른쪽 위 <b>⋮</b> 메뉴를 엽니다.
              </li>
              <li>
                <span className="guideSteps__n">2</span>
                <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 고릅니다.
              </li>
            </ol>
          </>
        )}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={onClose}>
            확인
          </button>
          <button type="button" className="sheet__ghost" onClick={() => void copyLink()}>
            {copied ? '복사됨' : '링크 복사'}
          </button>
        </div>
      </div>
    </div>
  );
}
