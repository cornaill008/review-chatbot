# Spec Delta

## Purpose

화면이 현재 데이터 모드와 인덱싱 상태를 서버로부터 받아 표시할 수 있도록, 모드 정보를 노출하는 상태 조회 API의 응답 규격과 동작을 정의한다.

## ADDED Requirements

### Requirement: 상태 조회 API
시스템은 `GET /api/status` 요청에 대해 `{ success: true, data: { mode, indexed, count } }`를 반환해야 한다(SHALL). `mode`는 `'mock'` 또는 `'real'`, `indexed`는 불리언, `count`는 적재된 리뷰 건수이다.

#### Scenario: 인덱싱 전
- **WHEN** 인덱싱이 한 번도 실행되지 않은 상태에서 상태를 조회한다
- **THEN** `indexed`는 `false`이고 `count`는 0이다

#### Scenario: 인덱싱 후
- **WHEN** 리뷰 12건이 인덱싱된 상태에서 상태를 조회한다
- **THEN** `indexed`는 `true`이고 `count`는 12이다

### Requirement: 모드 판별 일관성
시스템은 환경변수 `USE_MOCK`이 `'false'`가 아닌 모든 경우 `mode`를 `'mock'`으로, `'false'`일 때만 `'real'`로 반환해야 한다(MUST).

#### Scenario: 환경변수 미설정
- **WHEN** `USE_MOCK`이 설정되지 않은 상태에서 상태를 조회한다
- **THEN** `mode`는 `'mock'`이다

#### Scenario: 실데이터 모드
- **WHEN** `USE_MOCK`이 `'false'`인 상태에서 상태를 조회한다
- **THEN** `mode`는 `'real'`이다

### Requirement: 상태 조회 오류 처리
시스템은 상태를 확인하는 도중 내부 오류가 발생해도 서버 오류로 중단되지 않고 `{ success: false, error }`를 반환해야 한다(SHALL).

#### Scenario: 저장소 오류
- **WHEN** 상태 확인 중 저장소 접근에 실패한다
- **THEN** 응답은 `success: false`이며 `error`에 원인이 담긴다
