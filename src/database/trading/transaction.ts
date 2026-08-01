/**
 * 여러 저장 연산을 한 트랜잭션으로 묶는 진입점
 *
 * 조율 계층(src/trading)이 원자성을 요구할 때 쓴다.
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
