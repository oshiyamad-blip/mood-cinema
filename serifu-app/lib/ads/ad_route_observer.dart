import 'package:flutter/widgets.dart';

/// 広告の表示可否をルート遷移で制御するためのオブザーバ。
///
/// AdMobポリシー対応：バナーは「ホームが最前面のとき」だけロードし、
/// 他画面（特に練習画面）が上に乗ったら破棄する。裏に隠れたまま
/// 更新され続ける「見えないインプレッション」を構造的に防ぐ。
final adRouteObserver = RouteObserver<ModalRoute<void>>();
