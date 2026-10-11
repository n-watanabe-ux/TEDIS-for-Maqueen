/**
 * TEDIS for Maqueen - basic movement blocks
 * Target: DFRobot Maqueen Plus V3 using the official maqueenPlusV2 extension.
 *
 * This first implementation includes timed and continuous Tank/Steering movement.
 * Encoder-count movement is intentionally not included until a reliable public API
 * for per-wheel cumulative encoder counts is confirmed.
 */
//% color="#4C8C6B" icon="\uf1b9" block="移動"
namespace tedisMove {
    let initialized = false

    /** Select whether a timed movement is specified in seconds or wheel rotation angle. */
    export enum MoveUnit {
        //% block="秒"
        Seconds,
        //% block="度"
        Angle
    }

    /** Ensure the official Maqueen Plus extension has initialized its I2C controller. */
    function ensureInitialized(): void {
        if (!initialized) {
            maqueenPlusV2.I2CInit()
            initialized = true
        }
    }

    /** Convert TEDIS speed 0..100 to the Maqueen motor range.
     * 0 means stop; 1..100 maps linearly to 40..255.
     */
    function motorSpeed(percent: number): number {
        percent = Math.max(0, Math.min(100, percent))
        if (percent <= 0) return 0
        return Math.round(40 + percent * 215 / 100)
    }

    /** Send a signed percentage to one motor. Positive = forward, negative = backward. */
    function setMotor(motor: maqueenPlusV2.MyEnumMotor, signedPercent: number): void {
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

    /** Start Tank movement with independent left/right forward speed percentages. */
    function startTank(leftSpeed: number, rightSpeed: number): void {
        ensureInitialized()
        setMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, leftSpeed)
        setMotor(maqueenPlusV2.MyEnumMotor.RightMotor, rightSpeed)
    }

    /** Start Steering movement. Steering -100..100; signed speed -100..100. */
    function startSteering(steering: number, speed: number): void {
        steering = Math.max(-100, Math.min(100, steering))
        speed = Math.max(-100, Math.min(100, speed))

        let left = speed
        let right = speed
        if (steering >= 0) {
            right = speed * (1 - 2 * steering / 100)
        } else {
            left = speed * (1 + 2 * steering / 100)
        }

        ensureInitialized()
        setMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, left)
        setMotor(maqueenPlusV2.MyEnumMotor.RightMotor, right)
    }

    /**
     * Run the currently commanded movement until the faster wheel has travelled
     * the distance corresponding to the requested wheel angle. Speeds are read
     * separately for the left and right wheels from the Maqueen controller.
     * Wheel diameter is fixed at 43 mm (4.3 cm).
     */
    function runForWheelAngle(angle: number): void {
        const wheelDiameterCm = 4.3
        const targetDistanceCm = Math.PI * wheelDiameterCm * Math.max(0, angle) / 360
        let leftDistance = 0
        let rightDistance = 0
        let previousTime = input.runningTime()
        let lastMotionTime = previousTime

        while (Math.max(leftDistance, rightDistance) < targetDistanceCm) {
            basic.pause(20)
            const now = input.runningTime()
            const elapsedSeconds = Math.max(0, now - previousTime) / 1000
            previousTime = now
            const leftSpeed = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Left)
            const rightSpeed = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Right)
            leftDistance += leftSpeed * elapsedSeconds
            rightDistance += rightSpeed * elapsedSeconds
            if (leftSpeed > 0 || rightSpeed > 0) {
                lastMotionTime = now
            } else if (now - lastMotionTime > 2000) {
                // Avoid waiting forever if both motors are stopped or speed data is unavailable.
                break
            }
        }
        stop()
    }

    /** Run for either the specified time or the wheel rotation angle. */
    function runForUnit(unit: MoveUnit, amount: number): void {
        if (unit == MoveUnit.Seconds) {
            basic.pause(Math.max(0, amount) * 1000)
            stop()
        } else {
            runForWheelAngle(amount)
        }
    }

    /** Stop both motors using the official extension's stop command. */
    //% block="移動を停止"
    //% group="停止"
    //% weight=1
    export function stop(): void {
        ensureInitialized()
        maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
    }

    /** Tank drive for a specified number of seconds. */
    //% block="移動 左 %leftSpeed 右 %rightSpeed の速度 %amount %unit"
    //% leftSpeed.min=0 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=0 rightSpeed.max=100 rightSpeed.defl=50
    //% amount.min=0 amount.max=3600 amount.defl=1
    //% unit.defl=0
    //% group="タンク"
    //% weight=20
    export function tankForSeconds(leftSpeed: number, rightSpeed: number, amount: number, unit: MoveUnit): void {
        startTank(leftSpeed, rightSpeed)
        runForUnit(unit, amount)
    }

    /** Tank drive continuously until the stop block is called. */
    //% block="移動 左 %leftSpeed 右 %rightSpeed の速度で連続"
    //% leftSpeed.min=0 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=0 rightSpeed.max=100 rightSpeed.defl=50
    //% group="タンク"
    //% weight=19
    export function tankOn(leftSpeed: number, rightSpeed: number): void {
        startTank(leftSpeed, rightSpeed)
    }

    /** Steering drive for a specified number of seconds. */
    //% block="移動 方向 %steering 速度 %speed  %amount %unit"
    //% steering.min=-100 steering.max=100 steering.defl=0
    //% speed.min=-100 speed.max=100 speed.defl=50
    //% amount.min=0 amount.max=3600 amount.defl=1
    //% unit.defl=0
    //% group="ステアリング"
    //% weight=18
    export function steeringForSeconds(steering: number, speed: number, amount: number, unit: MoveUnit): void {
        startSteering(steering, speed)
        runForUnit(unit, amount)
    }

    /** Steering drive continuously until the stop block is called. */
    //% block="移動 方向 %steering 速度 %speed で連続"
    //% steering.min=-100 steering.max=100 steering.defl=0
    //% speed.min=-100 speed.max=100 speed.defl=50
    //% group="ステアリング"
    //% weight=17
    export function steeringOn(steering: number, speed: number): void {
        startSteering(steering, speed)
    }
}

