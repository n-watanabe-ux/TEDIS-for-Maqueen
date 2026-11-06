/**
 * TEDIS for Maqueen - basic movement blocks
 * Target: DFRobot Maqueen Plus V3 using the official maqueenPlusV2 extension.
 * https://makecode.microbit.org/pkg/dfrobot/pxt-dfrobot_maqueenplus_v20
 *
 * Timed and continuous Tank/Steering movement.
 * Wheel diameter is assumed to be 43 mm.
 */
//% color="#4C8C6B" icon="\uf1b9" block="TEDIS移動"
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

    /** Start Tank movement with independent left/right signed speed percentages. */
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
     * Run until the wheel that travels farthest reaches the requested rotation angle.
     * 元コードと全く同一のAPIのみを使用し、加減速の補間（平均値算定）で角度精度を改善
     */
    function runForWheelAngle(angle: number): void {
        if (angle <= 0) {
            stop()
            return
        }

        const wheelDiameterCm = 4.3
        const targetDistanceCm = (Math.PI * wheelDiameterCm * angle) / 360

        let leftDistance = 0
        let rightDistance = 0

        let prevLeftSpeed = Math.abs(maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Left))
        let prevRightSpeed = Math.abs(maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Right))

        let previousTime = input.runningTime()
        let lastMotionTime = previousTime

        while (Math.max(leftDistance, rightDistance) < targetDistanceCm) {
            basic.pause(10)

            const now = input.runningTime()
            const dt = (now - previousTime) / 1000
            previousTime = now

            const curLeftSpeed = Math.abs(maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Left))
            const curRightSpeed = Math.abs(maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Right))

            // 前回と今回の平均速度を用いて積算（加速・減速時の誤差を緩和）
            leftDistance += ((prevLeftSpeed + curLeftSpeed) / 2) * dt
            rightDistance += ((prevRightSpeed + curRightSpeed) / 2) * dt

            prevLeftSpeed = curLeftSpeed
            prevRightSpeed = curRightSpeed

            if (curLeftSpeed > 0 || curRightSpeed > 0) {
                lastMotionTime = now
            } else if (now - lastMotionTime > 2000) {
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

    /** Tank drive for a specified number of seconds or wheel rotation angle. */
    //% block="移動 左 %leftSpeed 右 %rightSpeed の速度で %amount %unit"
    //% inlineInputMode=inline
    //% leftSpeed.min=-100 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=-100 rightSpeed.max=100 rightSpeed.defl=50
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
    //% leftSpeed.min=-100 leftSpeed.max=100 leftSpeed.defl=50
    //% rightSpeed.min=-100 rightSpeed.max=100 rightSpeed.defl=50
    //% group="タンク"
    //% weight=19
    export function tankOn(leftSpeed: number, rightSpeed: number): void {
        startTank(leftSpeed, rightSpeed)
    }

    /** Steering drive for a specified number of seconds or wheel rotation angle. */
    //% block="移動 方向 %steering 速度 %speed で %amount %unit"
    //% inlineInputMode=inline
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
