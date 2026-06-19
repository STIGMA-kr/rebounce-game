# 애셋 교체 가이드

게임은 애셋이 없어도 기본 도형으로 실행됩니다. 아래 파일을 같은 경로와 이름으로 넣으면 자동으로 이미지가 사용됩니다.

## 이미지

- `assets/ui/background.png`: 960x640 배경 이미지
- `assets/player/node.png`: 플레이어 노드, 권장 128x128 PNG
- `assets/enemies/mob.png`: 잡몹, 원본 비율 1448x1086 기준
- `assets/enemies/mob_shoot.png`: 잡몹 발사 순간 이미지, `mob.png`와 같은 비율 권장
- `assets/boss/boss.png`: 보스, 원본 비율 1915x821 기준
- `assets/boss/boss_shoot.png`: 보스 발사 순간 이미지, `boss.png`와 같은 비율 권장
- `assets/balls/ball.png`: 잡몹 공, 권장 64x64 PNG

투명 배경 PNG를 추천합니다. 실제 렌더링 크기는 `js/game.js` 안에서 원본 비율을 유지한 채 캔버스 크기에 맞춰 조절됩니다. 발사 순간 이미지는 공을 쏠 때 짧게 표시된 뒤 기본 이미지로 돌아옵니다. 보스 공은 원형, 막대기, 삼각형, 사각형 도형으로 코드에서 직접 그립니다.

## 사운드

현재 기본 코드는 무음입니다. 효과음을 넣고 싶다면 `assets/sfx`에 파일을 넣은 뒤 `js/game.js`의 충돌 함수 `reflectMobBall`, `reflectBossBallFromNode`, `hitEnemy`, `hitBoss`, `damagePlayer`에서 재생을 연결하면 됩니다.
