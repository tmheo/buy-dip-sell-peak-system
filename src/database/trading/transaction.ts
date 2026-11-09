/**
 * 여러 저장 연산을 한 트랜잭션으로 묶는 진입점
 *
 * 조율 계층(src/trading)이 원자성이나 같은 시점의 읽기를 요구할 때 쓴다.
 * 조율 계층은 넘겨받은 실행자를 저장 함수에 그대로 전달할 뿐 직접 다루지 않으므로,
 * 트랜잭션을 어떻게 여는지는 저장 계층 안에만 남는다.
 */

import { db, type DbExecutor } from "../db-drizzle";

/**
 * work가 던지면 트랜잭션 전체가 롤백된다.
 */
export function runInTransaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return db.transaction(work);
}

/**
 * work 안의 모든 읽기가 같은 시점의 데이터를 보게 한다 (읽기 전용, REPEATABLE READ).
 * 시점은 work의 첫 쿼리에서 정해지고, 그 뒤에 커밋된 다른 요청의 쓰기는 보이지 않는다.
 * 따로 읽은 값들을 함께 쓰는 계산(보유 티어와 수익 기록으로 구하는 예수금 등)이
 * 서로 다른 순간의 값을 섞지 않게 하려는 것이다.
 *
 * 연결이 인스턴스당 하나이므로 work 안의 쿼리는 모두 넘겨받은 실행자로 보내야 한다.
 * 기본 연결로 보내면 이 트랜잭션이 끝나기를 기다리며 멈춘다.
 */
export function runInReadSnapshot<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return db.transaction(work, { isolationLevel: "repeatable read", accessMode: "read only" });
}
