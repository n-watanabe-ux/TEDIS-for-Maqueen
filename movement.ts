/**
 * TEDIS for Maqueen - basic movement blocks
 * Target: DFRobot Maqueen Plus V3 using official maqueenPlusV2 extension.
 *
 * Timed and angle-based Tank/Steering movement.
 * Angle mode estimates wheel rotation by integrating absolute
 * per-wheel linear-speed readings.
 * Wheel diameter: 43 mm.
 */
//% color="#4C8C6B" icon="\uf1b9" block="TEDIS移動"
namespace tedisMove {

    let initialized = false

    // Manual straight correction
    let straightCorrection = 0

    /*
    // Deceleration parameters (保存用)
    let decelerationStartAngle = 90
    let decelerationP = 1
    let minimumSpeed = 10
    */

    /** Movement unit */
    export enum MoveUnit {
        //% block="秒"
        Seconds = 0,
        //% block="度"
        Angle = 1
    }

    function ensureInitialized(): void {
        if (!initialized) {
            maqueenPlusV2.I2CInit()
            initialized = true
        }
    }

    /** Convert TEDIS speed 0..100 to Maqueen motor range. */
    function motorSpeed(percent: number): number {
        percent = Math.max(0, Math.min(100, percent))
        if (percent <= 0) return 0
        return Math.round(40 + percent * 215 / 100)
    }

    /** Set one motor. Positive = forward, negative = backward. */
    function setMotor(
        motor: maqueenPlusV2.MyEnumMotor,
        signedPercent: number
    ): void {

        const magnitude = Math.max(-100, Math.min(100, signedPercent))

        if (Math.abs(magnitude) < 0.5) {
            maqueenPlusV2.controlMotorStop(motor)
            return
        }

        const direction = magnitude >= 0
            ? maqueenPlusV2.MyEnumDir.Forward
            : maqueenPlusV2.MyEnumDir.Backward

        maqueenPlusV2.controlMotor(
            motor,
            direction,
            motorSpeed(Math.abs(magnitude))
        )
    }

    /**
     * Apply proportional manual straight correction.
     * Positive = right, Negative = left.
     */
    function applyStraightCorrection(
        left: number,
        right: number
    ): number[] {

        if (straightCorrection == 0) return [left, right]

        // Skip opposite-direction movement.
        if (left * right < 0) return [left, right]

        // Skip when either motor is stopped.
        if (Math.abs(left) < 0.5 || Math.abs(right) < 0.5) {
            return [left, right]
        }

        const direction = left >= 0 ? 1 : -1
        const baseSpeed = (Math.abs(left) + Math.abs(right)) / 2
        const adjustment = baseSpeed * straightCorrection / 200

        left += direction * adjustment
        right -= direction * adjustment

        // Preserve the speed difference when exceeding 100.
        const maxSpeed = Math.max(Math.abs(left), Math.abs(right))

        if (maxSpeed > 100) {
            const excess = maxSpeed - 100
            left -= direction * excess
            right -= direction * excess
        }

        return [left, right]
    }

    /** Manual straight correction setting. */
    //% block="直進補正を設定 %correction"
    //% correction.min=-100 correction.max=100 correction.defl=0
    //% group="補正"
    //% weight=30
    export function setStraightCorrection(correction: number): void {
        straightCorrection = Math.max(-100, Math.min(100, correction))
    }

    /*
    // 減速設定ブロック（保存用）

    //% block="減速設定 開始角度 %startAngle P係数 %pGain 最低速度 %minSpeed"
    //% startAngle.min=1 startAngle.max=180 startAngle.defl=90
    //% pGain.min=0.1 pGain.max=3 pGain.defl=1
    //% minSpeed.min=1 minSpeed.max=50 minSpeed.defl=10
    //% group="補正"
    //% weight=29
    export function setDecelerationParameters(
        startAngle: number,
        pGain: number,
        minSpeed: number
    ): void {

        decelerationStartAngle = Math.max(1, startAngle)
        decelerationP = Math.max(0.1, Math.min(3, pGain))
        minimumSpeed = Math.max(1, Math.min(50, minSpeed))
    }
    */

    /** Start Tank movement. */
    function startTank(leftSpeed: number, rightSpeed: number): void {
        ensureInitialized()

        leftSpeed = Math.max(-100, Math.min(100, leftSpeed))
        rightSpeed = Math.max(-100, Math.min(100, rightSpeed))

        const corrected = applyStraightCorrection(leftSpeed, rightSpeed)

        setMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, corrected[0])
        setMotor(maqueenPlusV2.MyEnumMotor.RightMotor, corrected[1])
    }

    /** Calculate Steering motor speeds. */
    function getSteeringSpeeds(
        steering: number,
        speed: number
    ): number[] {

        steering = Math.max(-100, Math.min(100, steering))
        speed = Math.max(-100, Math.min(100, speed))

        let left = speed
        let right = speed

        if (steering >= 0) {
            right = speed * (1 - 2 * steering / 100)
        } else {
            left = speed * (1 + 2 * steering / 100)
        }

        return applyStraightCorrection(left, right)
    }

    /** Start Steering movement. */
    function startSteering(steering: number, speed: number): void {
        ensureInitialized()

        const corrected = getSteeringSpeeds(steering, speed)

        setMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, corrected[0])
        setMotor(maqueenPlusV2.MyEnumMotor.RightMotor, corrected[1])
    }

    /**
     * Standard angle movement.
     * Stop both motors when the farther-travelling wheel
     * reaches the corrected target angle.
     */
    function runForWheelAngle(angle: number, speed: number): void {

        ensureInitialized()

        // Angle range
        angle = Math.max(90, Math.min(3600, angle))

        const wheelDiameterCm = 4.3

        // Speed-based stopping angle correction
        const correctionAngle = 2.75 * Math.abs(speed) + 35

        // Keep a small positive movement threshold
        const stopAngle = Math.max(5, angle - correctionAngle)

        const targetDistanceCm =
            Math.PI * wheelDiameterCm * stopAngle / 360

        let leftDistance = 0
        let rightDistance = 0

        let previousTime = input.runningTime()
        let lastMotionTime = previousTime

        while (Math.max(leftDistance, rightDistance) < targetDistanceCm) {

            basic.pause(20)

            const now = input.runningTime()
            const elapsedSeconds = Math.max(0, now - previousTime) / 1000
            previousTime = now

            const leftSpeed = Math.abs(
                maqueenPlusV2.readRealTimeSpeed(
                    maqueenPlusV2.DirectionType2.Left
                )
            )

            const rightSpeed = Math.abs(
                maqueenPlusV2.readRealTimeSpeed(
                    maqueenPlusV2.DirectionType2.Right
                )
            )

            leftDistance += leftSpeed * elapsedSeconds
            rightDistance += rightSpeed * elapsedSeconds

            if (leftSpeed > 0 || rightSpeed > 0) {
                lastMotionTime = now
            } else if (now - lastMotionTime > 2000) {
                break
            }
        }

        stop()
    }

    /*
    // 減速角度移動（保存用）
    // 現時点では使用しない。
    // 再利用時にはモーター指定や停止補正を再確認すること。

    function runForWheelAngleDecel(
        angle: number,
        leftBase: number,
        rightBase: number
    ): void {

        ensureInitialized()

        const wheelDiameter = 4.3
        const targetDistanceCm =
            Math.PI * wheelDiameter * angle / 360

        let leftDistance = 0
        let rightDistance = 0

        let previousTime = input.runningTime()
        let lastMotionTime = previousTime
        let lastLogTime = previousTime

        let leftSpeed = 0
        let rightSpeed = 0

        const maxBaseSpeed = Math.max(
            Math.abs(leftBase),
            Math.abs(rightBase)
        )

        setMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, leftBase)
        setMotor(maqueenPlusV2.MyEnumMotor.RightMotor, rightBase)

        while (Math.max(leftDistance, rightDistance) < targetDistanceCm) {

            let travelledDistance = Math.max(
                leftDistance,
                rightDistance
            )

            let remainingDistance =
                targetDistanceCm - travelledDistance

            let remainingAngle =
                remainingDistance / (Math.PI * wheelDiameter) * 360

            let speedScale = 1
            let targetSpeed = maxBaseSpeed

            if (remainingAngle < decelerationStartAngle) {

                let progress =
                    (decelerationStartAngle - remainingAngle) /
                    decelerationStartAngle

                let reduction =
                    (maxBaseSpeed - minimumSpeed) *
                    progress *
                    decelerationP

                targetSpeed = Math.max(
                    minimumSpeed,
                    maxBaseSpeed - reduction
                )

                if (maxBaseSpeed > 0) {
                    speedScale = Math.min(
                        1,
                        targetSpeed / maxBaseSpeed
                    )
                }
            }

            let commandLeft = leftBase * speedScale
            let commandRight = rightBase * speedScale

            setMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, commandLeft)
            setMotor(maqueenPlusV2.MyEnumMotor.RightMotor, commandRight)

            basic.pause(20)

            let currentTime = input.runningTime()
            let elapsedSeconds =
                (currentTime - previousTime) / 1000

            previousTime = currentTime

            leftSpeed = Math.abs(
                maqueenPlusV2.readRealTimeSpeed(
                    maqueenPlusV2.DirectionType2.Left
                )
            )

            rightSpeed = Math.abs(
                maqueenPlusV2.readRealTimeSpeed(
                    maqueenPlusV2.DirectionType2.Right
                )
            )

            leftDistance += leftSpeed * elapsedSeconds
            rightDistance += rightSpeed * elapsedSeconds

            if (leftSpeed > 0 || rightSpeed > 0) {
                lastMotionTime = currentTime
            }

            if (currentTime - lastLogTime >= 100) {

                serial.writeLine(
                    "t=" + currentTime +
                    " rem=" + remainingAngle +
                    " target=" + targetSpeed +
                    " cmdL=" + commandLeft +
                    " cmdR=" + commandRight +
                    " Lspd=" + leftSpeed +
                    " Rspd=" + rightSpeed
                )

                lastLogTime = currentTime
            }

            if (currentTime - lastMotionTime > 2000) {
                break
            }
        }

        stop()
    }
    */

    /** Standard timed or angle movement. */
    function runForUnit(
        unit: MoveUnit,
        amount: number,
        speed: number
    ): void {

        if (unit == MoveUnit.Seconds) {
            basic.pause(Math.max(0, Math.min(3600, amount)) * 1000)
            stop()
        } else {
            runForWheelAngle(amount, speed)
        }
    }

    // PID distance control with selectable speed
    //% block="PID距離テスト 方向 %direction|速度 %speed|距離 %distance cm"
    //% speed.min=1 speed.max=5
    //% distance.min=1
    //% group="テスト"
    export function testDistancePID(
        direction: maqueenPlusV2.SpeedDirection,
        speed: number,
        distance: number
    ): void {

        ensureInitialized()

        speed = Math.max(1, Math.min(5, Math.round(speed)))
        distance = Math.max(1, Math.round(distance))

        let buffer = pins.createBuffer(2)

        if (distance >= 6000) {
            distance = 60000
        }

        // Direction
        buffer[0] = 64
        buffer[1] = direction
        pins.i2cWriteBuffer(0x10, buffer)

        // PID speed
        buffer[0] = 85
        buffer[1] = speed
        pins.i2cWriteBuffer(0x10, buffer)

        // Distance high byte
        buffer[0] = 65
        buffer[1] = distance >> 8
        pins.i2cWriteBuffer(0x10, buffer)

        // Distance low byte
        buffer[0] = 66
        buffer[1] = distance
        pins.i2cWriteBuffer(0x10, buffer)

        // Start PID distance control
        buffer[0] = 60
        buffer[1] = 0x04 | 0x02
        pins.i2cWriteBuffer(0x10, buffer)

        // Wait until PID control finishes
        pins.i2cWriteNumber(0x10, 87, NumberFormat.Int8LE)

        let flagBuffer = pins.createBuffer(1)
        flagBuffer = pins.i2cReadBuffer(0x10, 1)

        while (flagBuffer[0] == 1) {
            basic.pause(10)
            flagBuffer = pins.i2cReadBuffer(0x10, 1)
        }
    }

    /** Stop both motors. */
    //% block="移動を停止"
    //% group="停止"
    //% weight=1
    export function stop(): void {
        ensureInitialized()
        maqueenPlusV2.controlMotorStop(
            maqueenPlusV2.MyEnumMotor.AllMotor
        )
    }

    /** Tank movement for time or angle. */
    //% block="移動 左 %leftSpeed 右 %rightSpeed の速度で %amount %unit"
    //% inlineInputMode=inline
    //% leftSpeed.min=-100 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=-100 rightSpeed.max=100 rightSpeed.defl=50
    //% amount.min=0 amount.max=3600 amount.defl=360
    //% unit.defl=0
    //% group="タンク"
    //% weight=20
    export function tankForSeconds(
        leftSpeed: number,
        rightSpeed: number,
        amount: number,
        unit: MoveUnit
    ): void {

        leftSpeed = Math.max(-100, Math.min(100, leftSpeed))
        rightSpeed = Math.max(-100, Math.min(100, rightSpeed))

        const corrected = applyStraightCorrection(leftSpeed, rightSpeed)

        if (unit == MoveUnit.Angle) {

            const outerSpeed = Math.max(
                Math.abs(corrected[0]),
                Math.abs(corrected[1])
            )

            startTank(leftSpeed, rightSpeed)
            runForUnit(unit, amount, outerSpeed)

        } else {

            startTank(leftSpeed, rightSpeed)
            runForUnit(unit, amount, 0)
        }
    }

    /** Continuous Tank movement. */
    //% block="移動 左 %leftSpeed 右 %rightSpeed の速度で連続"
    //% leftSpeed.min=-100 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=-100 rightSpeed.max=100 rightSpeed.defl=50
    //% group="タンク"
    //% weight=19
    export function tankOn(
        leftSpeed: number,
        rightSpeed: number
    ): void {

        leftSpeed = Math.max(-100, Math.min(100, leftSpeed))
        rightSpeed = Math.max(-100, Math.min(100, rightSpeed))

        startTank(leftSpeed, rightSpeed)
    }

    /** Steering movement for time or angle. */
    //% block="移動 方向 %steering 速度 %speed で %amount %unit"
    //% inlineInputMode=inline
    //% steering.min=-100 steering.max=100 steering.defl=0
    //% speed.min=-100 speed.max=100 speed.defl=50
    //% amount.min=0 amount.max=3600 amount.defl=360
    //% unit.defl=0
    //% group="ステアリング"
    //% weight=18
    export function steeringForSeconds(
        steering: number,
        speed: number,
        amount: number,
        unit: MoveUnit
    ): void {

        steering = Math.max(-100, Math.min(100, steering))
        speed = Math.max(-100, Math.min(100, speed))

        if (unit == MoveUnit.Angle) {

            const corrected = getSteeringSpeeds(steering, speed)

            const outerSpeed = Math.max(
                Math.abs(corrected[0]),
                Math.abs(corrected[1])
            )

            startSteering(steering, speed)
            runForUnit(unit, amount, outerSpeed)

        } else {

            startSteering(steering, speed)
            runForUnit(unit, amount, 0)
        }
    }

    /** Continuous Steering movement. */
    //% block="移動 方向 %steering 速度 %speed で連続"
    //% steering.min=-100 steering.max=100 steering.defl=0
    //% speed.min=-100 speed.max=100 speed.defl=50
    //% group="ステアリング"
    //% weight=17
    export function steeringOn(
        steering: number,
        speed: number
    ): void {

        steering = Math.max(-100, Math.min(100, steering))
        speed = Math.max(-100, Math.min(100, speed))

        startSteering(steering, speed)
    }
}
